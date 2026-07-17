"""Deterministic invoice interpreter shared by runtime, tests, and generated code."""

from collections.abc import Mapping
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, field_validator

from app.services.invoice_compiler import InvoiceCompilerConfig


class WorkflowStatus(StrEnum):
    APPROVAL_REQUIRED = "approval_required"
    EXCEPTION = "exception"
    HUMAN_REVIEW = "human_review"


class InvoiceRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    invoice_number: str | None = None
    purchase_order: str | None = None
    total: Decimal
    currency: str = "USD"
    unreadable_invoice_number: bool = False

    @field_validator("total", mode="before")
    @classmethod
    def _coerce_total(cls, value: object) -> Decimal:
        return Decimal(str(value))


class PurchaseOrderRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    purchase_order: str
    total: Decimal
    currency: str = "USD"

    @field_validator("total", mode="before")
    @classmethod
    def _coerce_total(cls, value: object) -> Decimal:
        return Decimal(str(value))


class WorkflowResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: WorkflowStatus
    reason: str
    expected_total: Decimal | None = None
    actual_total: Decimal | None = None
    protected_action_executed: bool = False
    compiler_fingerprint: str | None = None


def amounts_within_tolerance(
    invoice_total: Decimal,
    po_total: Decimal,
    tolerance: Decimal,
) -> bool:
    return abs(invoice_total - po_total) <= tolerance


def interpret_invoice(
    invoice: InvoiceRecord,
    purchase_orders: Mapping[str, PurchaseOrderRecord],
    config: InvoiceCompilerConfig,
) -> WorkflowResult:
    """Apply InvoiceCompilerConfig rules to a synthetic invoice."""
    fingerprint = (
        f"tol={config.amount_tolerance}|currency={config.compare_currency}|"
        f"mismatch={config.amount_mismatch_action}|delivery={config.exception_delivery}"
    )

    if invoice.unreadable_invoice_number or not invoice.invoice_number:
        return WorkflowResult(
            status=WorkflowStatus(config.missing_invoice_number_action),
            reason="Invoice number is missing or unreadable.",
            compiler_fingerprint=fingerprint,
        )
    if not invoice.purchase_order:
        return WorkflowResult(
            status=WorkflowStatus(config.missing_purchase_order_action),
            reason="Purchase-order number is missing or unreadable.",
            compiler_fingerprint=fingerprint,
        )

    purchase_order = purchase_orders.get(invoice.purchase_order)
    if purchase_order is None:
        return WorkflowResult(
            status=WorkflowStatus(config.purchase_order_not_found_action),
            reason="Purchase order was not found.",
            compiler_fingerprint=fingerprint,
        )

    if config.compare_currency and invoice.currency != purchase_order.currency:
        status = WorkflowStatus(config.amount_mismatch_action)
        if config.exception_delivery == "human_review" and status is WorkflowStatus.EXCEPTION:
            status = WorkflowStatus.HUMAN_REVIEW
        return WorkflowResult(
            status=status,
            reason="Invoice and purchase-order currencies do not match.",
            expected_total=purchase_order.total,
            actual_total=invoice.total,
            compiler_fingerprint=fingerprint,
        )

    if not amounts_within_tolerance(
        invoice.total, purchase_order.total, config.amount_tolerance
    ):
        status = WorkflowStatus(config.amount_mismatch_action)
        if (
            config.exception_delivery == "human_review"
            and status is WorkflowStatus.EXCEPTION
        ):
            status = WorkflowStatus.HUMAN_REVIEW
        reason = "Invoice and purchase-order amounts do not match."
        if config.exception_delivery == "draft" and status is WorkflowStatus.EXCEPTION:
            reason = "Invoice and purchase-order amounts do not match; exception draft required."
        elif config.exception_delivery == "human_review":
            reason = "Invoice and purchase-order amounts do not match; human review required."
        return WorkflowResult(
            status=status,
            reason=reason,
            expected_total=purchase_order.total,
            actual_total=invoice.total,
            compiler_fingerprint=fingerprint,
        )

    return WorkflowResult(
        status=WorkflowStatus(config.matching_action),
        reason="Invoice and purchase order match; human approval is required.",
        compiler_fingerprint=fingerprint,
    )


DEFAULT_COMPILER_CONFIG = InvoiceCompilerConfig()
