"""Trusted invoice code generation; no arbitrary model or shell execution."""
# Generated source strings intentionally preserve readable examples on one line.
# ruff: noqa: E501

import io
import zipfile
from datetime import UTC, datetime

from app.models.workflow import ExecutableWorkflow, GeneratedFile, WorkflowIR

GENERATOR_VERSION = "invoice-template-0.1.0"


def _workflow_source() -> str:
    return '''"""Generated restricted invoice workflow."""
from dataclasses import dataclass
from enum import StrEnum
from collections.abc import Mapping

class WorkflowStatus(StrEnum):
    APPROVAL_REQUIRED = "approval_required"
    EXCEPTION = "exception"
    HUMAN_REVIEW = "human_review"

@dataclass
class WorkflowResult:
    status: WorkflowStatus
    reason: str
    expected_total: float | None = None
    actual_total: float | None = None

def process_invoice(
    invoice: Mapping[str, object],
    purchase_orders: Mapping[str, Mapping[str, float]],
) -> WorkflowResult:
    if not invoice.get("invoice_number") or invoice.get("unreadable_invoice_number"):
        return WorkflowResult(WorkflowStatus.HUMAN_REVIEW, "Invoice number is missing or unreadable.")
    if not invoice.get("purchase_order"):
        return WorkflowResult(WorkflowStatus.HUMAN_REVIEW, "Purchase-order number is missing or unreadable.")
    purchase_order = purchase_orders.get(invoice["purchase_order"])
    if purchase_order is None:
        return WorkflowResult(WorkflowStatus.HUMAN_REVIEW, "Purchase order was not found.")
    if invoice["total"] != purchase_order["total"]:
        return WorkflowResult(WorkflowStatus.EXCEPTION, "Invoice and purchase-order amounts do not match.", purchase_order["total"], invoice["total"])
    return WorkflowResult(WorkflowStatus.APPROVAL_REQUIRED, "Invoice and purchase order match; human approval is required.")
'''


def _test_source() -> str:
    return '''from workflow import WorkflowStatus, process_invoice

def test_matching_invoice_requires_approval():
    result = process_invoice({"invoice_number": "INV-1001", "purchase_order": "PO-1001", "total": 1250.0}, {"PO-1001": {"total": 1250.0}})
    assert result.status == WorkflowStatus.APPROVAL_REQUIRED

def test_amount_mismatch_is_exception():
    result = process_invoice({"invoice_number": "INV-1002", "purchase_order": "PO-1002", "total": 980.0}, {"PO-1002": {"total": 900.0}})
    assert result.status == WorkflowStatus.EXCEPTION

def test_missing_purchase_order_is_review():
    result = process_invoice({"invoice_number": "INV-1003", "purchase_order": None, "total": 500.0}, {})
    assert result.status == WorkflowStatus.HUMAN_REVIEW
'''


def _readme_source(workflow: WorkflowIR) -> str:
    return f"""# Generated workflow: {workflow.name}\n\nThis restricted artifact processes synthetic invoices only. Approval actions are never executed automatically.\n\nGenerator: {GENERATOR_VERSION}\n"""


def generate_invoice_artifact(workflow: WorkflowIR) -> ExecutableWorkflow:
    if workflow.id != "invoice-approval-demo":
        raise ValueError("Only the synthetic invoice workflow has a trusted generator")
    if any(uncertainty.required for uncertainty in workflow.uncertainties):
        raise ValueError("Resolve required workflow questions before generating code")
    files = [
        GeneratedFile(path="workflow.py", language="python", content=_workflow_source()),
        GeneratedFile(path="test_workflow.py", language="python", content=_test_source()),
        GeneratedFile(path="README.md", language="markdown", content=_readme_source(workflow)),
    ]
    return ExecutableWorkflow(
        workflow_id=workflow.id,
        runtime="python",
        files=files,
        generated_at=datetime.now(UTC),
        generator_version=GENERATOR_VERSION,
    )


def artifact_zip(artifact: ExecutableWorkflow) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for file in artifact.files:
            archive.writestr(file.path, file.content)
    return buffer.getvalue()
