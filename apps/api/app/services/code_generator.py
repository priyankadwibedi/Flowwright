"""Trusted invoice code generation from InvoiceCompilerConfig; no arbitrary execution."""
# Generated source strings intentionally preserve readable examples on one line.
# ruff: noqa: E501

import io
import zipfile
from datetime import UTC, datetime
from decimal import Decimal
from textwrap import dedent

from app.models.workflow import ExecutableWorkflow, GeneratedFile, WorkflowIR
from app.services.invoice_compiler import (
    CompilerRejectedError,
    InvoiceCompilerConfig,
    config_fingerprint,
    extract_invoice_compiler_config,
)

GENERATOR_VERSION = "invoice-compiler-0.2.0"


def _workflow_source(config: InvoiceCompilerConfig) -> str:
    tolerance = str(config.amount_tolerance)
    compare_currency = "True" if config.compare_currency else "False"
    mismatch = config.amount_mismatch_action
    delivery = config.exception_delivery
    matching = config.matching_action
    fingerprint = config_fingerprint(config)
    return dedent(
        f'''\
        """Generated restricted invoice workflow from InvoiceCompilerConfig."""
        from decimal import Decimal
        from enum import StrEnum
        from collections.abc import Mapping

        # compiler_fingerprint={fingerprint}
        COMPARE_CURRENCY = {compare_currency}
        AMOUNT_TOLERANCE = Decimal("{tolerance}")
        AMOUNT_MISMATCH_ACTION = "{mismatch}"
        EXCEPTION_DELIVERY = "{delivery}"
        MATCHING_ACTION = "{matching}"
        MISSING_INVOICE_NUMBER_ACTION = "human_review"
        MISSING_PURCHASE_ORDER_ACTION = "human_review"
        PURCHASE_ORDER_NOT_FOUND_ACTION = "human_review"

        class WorkflowStatus(StrEnum):
            APPROVAL_REQUIRED = "approval_required"
            EXCEPTION = "exception"
            HUMAN_REVIEW = "human_review"

        class WorkflowResult:
            def __init__(self, status, reason, expected_total=None, actual_total=None):
                self.status = status
                self.reason = reason
                self.expected_total = expected_total
                self.actual_total = actual_total
                self.protected_action_executed = False
                self.compiler_fingerprint = "{fingerprint}"

        def _as_decimal(value):
            return Decimal(str(value))

        def process_invoice(invoice: Mapping[str, object], purchase_orders: Mapping[str, Mapping[str, object]]) -> WorkflowResult:
            if not invoice.get("invoice_number") or invoice.get("unreadable_invoice_number"):
                return WorkflowResult(WorkflowStatus(MISSING_INVOICE_NUMBER_ACTION), "Invoice number is missing or unreadable.")
            if not invoice.get("purchase_order"):
                return WorkflowResult(WorkflowStatus(MISSING_PURCHASE_ORDER_ACTION), "Purchase-order number is missing or unreadable.")
            purchase_order = purchase_orders.get(str(invoice["purchase_order"]))
            if purchase_order is None:
                return WorkflowResult(WorkflowStatus(PURCHASE_ORDER_NOT_FOUND_ACTION), "Purchase order was not found.")
            invoice_total = _as_decimal(invoice["total"])
            po_total = _as_decimal(purchase_order["total"])
            invoice_currency = str(invoice.get("currency", "USD"))
            po_currency = str(purchase_order.get("currency", "USD"))
            if COMPARE_CURRENCY and invoice_currency != po_currency:
                status = WorkflowStatus(AMOUNT_MISMATCH_ACTION)
                if EXCEPTION_DELIVERY == "human_review" and status is WorkflowStatus.EXCEPTION:
                    status = WorkflowStatus.HUMAN_REVIEW
                return WorkflowResult(status, "Invoice and purchase-order currencies do not match.", po_total, invoice_total)
            if abs(invoice_total - po_total) > AMOUNT_TOLERANCE:
                status = WorkflowStatus(AMOUNT_MISMATCH_ACTION)
                if EXCEPTION_DELIVERY == "human_review" and status is WorkflowStatus.EXCEPTION:
                    status = WorkflowStatus.HUMAN_REVIEW
                reason = "Invoice and purchase-order amounts do not match."
                if EXCEPTION_DELIVERY == "draft" and status is WorkflowStatus.EXCEPTION:
                    reason = "Invoice and purchase-order amounts do not match; exception draft required."
                elif EXCEPTION_DELIVERY == "human_review":
                    reason = "Invoice and purchase-order amounts do not match; human review required."
                return WorkflowResult(status, reason, po_total, invoice_total)
            return WorkflowResult(WorkflowStatus(MATCHING_ACTION), "Invoice and purchase order match; human approval is required.")
        '''
    )


def _test_source(config: InvoiceCompilerConfig) -> str:
    tolerance = config.amount_tolerance
    # When tolerance is large enough, a 80-unit mismatch may still match.
    mismatch_expected = "APPROVAL_REQUIRED" if tolerance >= 80 else "EXCEPTION"
    if config.exception_delivery == "human_review" and mismatch_expected == "EXCEPTION":
        mismatch_expected = "HUMAN_REVIEW"
    if config.amount_mismatch_action == "human_review" and mismatch_expected == "EXCEPTION":
        mismatch_expected = "HUMAN_REVIEW"
    currency_expected = (
        "APPROVAL_REQUIRED"
        if not config.compare_currency
        else config.amount_mismatch_action.upper()
    )
    if config.compare_currency and config.exception_delivery == "human_review":
        currency_expected = "HUMAN_REVIEW"
    boundary_expected = (
        "APPROVAL_REQUIRED" if tolerance >= Decimal("0.01") else "EXCEPTION"
    )
    if config.exception_delivery == "human_review" and boundary_expected == "EXCEPTION":
        boundary_expected = "HUMAN_REVIEW"
    fingerprint = config_fingerprint(config)
    return dedent(
        f'''\
        from decimal import Decimal
        from workflow import WorkflowStatus, process_invoice, AMOUNT_TOLERANCE, EXCEPTION_DELIVERY

        # compiler_fingerprint={fingerprint}

        def test_matching_invoice_requires_approval():
            result = process_invoice(
                {{"invoice_number": "INV-1001", "purchase_order": "PO-1001", "total": Decimal("1250.00"), "currency": "USD"}},
                {{"PO-1001": {{"total": Decimal("1250.00"), "currency": "USD"}}}},
            )
            assert result.status == WorkflowStatus.APPROVAL_REQUIRED

        def test_amount_mismatch_respects_compiler_config():
            result = process_invoice(
                {{"invoice_number": "INV-1002", "purchase_order": "PO-1002", "total": Decimal("980.00"), "currency": "USD"}},
                {{"PO-1002": {{"total": Decimal("900.00"), "currency": "USD"}}}},
            )
            assert result.status == WorkflowStatus.{mismatch_expected}
            assert AMOUNT_TOLERANCE == Decimal("{tolerance}")
            assert EXCEPTION_DELIVERY == "{config.exception_delivery}"

        def test_missing_purchase_order_is_review():
            result = process_invoice(
                {{"invoice_number": "INV-1003", "purchase_order": None, "total": Decimal("500.00"), "currency": "USD"}},
                {{}},
            )
            assert result.status == WorkflowStatus.HUMAN_REVIEW

        def test_currency_mismatch():
            result = process_invoice(
                {{"invoice_number": "INV-1004", "purchase_order": "PO-1001", "total": Decimal("1250.00"), "currency": "EUR"}},
                {{"PO-1001": {{"total": Decimal("1250.00"), "currency": "USD"}}}},
            )
            assert result.status == WorkflowStatus.{currency_expected}

        def test_decimal_precision():
            result = process_invoice(
                {{"invoice_number": "INV-1005", "purchase_order": "PO-1005", "total": Decimal("0.1") + Decimal("0.2"), "currency": "USD"}},
                {{"PO-1005": {{"total": Decimal("0.3"), "currency": "USD"}}}},
            )
            assert result.status == WorkflowStatus.APPROVAL_REQUIRED

        def test_decimal_tolerance_boundary():
            result = process_invoice(
                {{"invoice_number": "INV-1006", "purchase_order": "PO-1006", "total": Decimal("1250.01"), "currency": "USD"}},
                {{"PO-1006": {{"total": Decimal("1250.00"), "currency": "USD"}}}},
            )
            assert result.status == WorkflowStatus.{boundary_expected}
        '''
    )


def _readme_source(workflow: WorkflowIR, config: InvoiceCompilerConfig) -> str:
    return (
        f"# Generated workflow: {workflow.name}\n\n"
        "This restricted artifact processes synthetic invoices only. "
        "Approval actions are never executed automatically.\n\n"
        f"Generator: {GENERATOR_VERSION}\n"
        f"Workflow kind: {workflow.workflow_kind}\n"
        f"Compiler fingerprint: {config_fingerprint(config)}\n"
        f"Amount tolerance: {config.amount_tolerance}\n"
        f"Exception delivery: {config.exception_delivery}\n"
    )


def generate_invoice_artifact(workflow: WorkflowIR) -> ExecutableWorkflow:
    try:
        config = extract_invoice_compiler_config(workflow)
    except CompilerRejectedError as exc:
        raise ValueError(str(exc)) from exc
    fingerprint = config_fingerprint(config)
    files = [
        GeneratedFile(
            path="workflow.py", language="python", content=_workflow_source(config)
        ),
        GeneratedFile(
            path="test_workflow.py", language="python", content=_test_source(config)
        ),
        GeneratedFile(
            path="README.md",
            language="markdown",
            content=_readme_source(workflow, config),
        ),
    ]
    return ExecutableWorkflow(
        workflow_id=workflow.id,
        runtime="python",
        files=files,
        generated_at=datetime.now(UTC),
        generator_version=GENERATOR_VERSION,
        compiler_fingerprint=fingerprint,
        workflow_kind=workflow.workflow_kind,
    )


def artifact_zip(artifact: ExecutableWorkflow) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for file in artifact.files:
            info = zipfile.ZipInfo(file.path)
            info.date_time = (2024, 1, 1, 0, 0, 0)
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, file.content)
    return buffer.getvalue()
