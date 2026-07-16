"""Restricted, auditable invoice runtime shared by tests and the mini-app."""

import csv
from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel


class WorkflowStatus(StrEnum):
    APPROVAL_REQUIRED = "approval_required"
    EXCEPTION = "exception"
    HUMAN_REVIEW = "human_review"


class InvoiceRecord(BaseModel):
    invoice_number: str | None = None
    purchase_order: str | None = None
    total: float
    currency: str = "USD"
    unreadable_invoice_number: bool = False


class PurchaseOrderRecord(BaseModel):
    purchase_order: str
    total: float
    currency: str = "USD"


class WorkflowResult(BaseModel):
    status: WorkflowStatus
    reason: str
    expected_total: float | None = None
    actual_total: float | None = None
    protected_action_executed: bool = False


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def load_invoice(filename: str) -> InvoiceRecord:
    path = repo_root() / "examples" / "invoice-approval" / "invoices" / filename
    try:
        return InvoiceRecord.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValueError(f"Synthetic invoice fixture not found or invalid: {filename}") from exc


def load_purchase_orders() -> dict[str, PurchaseOrderRecord]:
    path = repo_root() / "examples" / "invoice-approval" / "purchase_orders.csv"
    with path.open(newline="", encoding="utf-8") as file:
        return {
            row["purchase_order"]: PurchaseOrderRecord(
                purchase_order=row["purchase_order"],
                total=float(row["total"]),
                currency=row.get("currency", "USD"),
            )
            for row in csv.DictReader(file)
        }


def process_invoice(
    invoice: InvoiceRecord,
    purchase_orders: dict[str, PurchaseOrderRecord],
) -> WorkflowResult:
    if invoice.unreadable_invoice_number or not invoice.invoice_number:
        return WorkflowResult(
            status=WorkflowStatus.HUMAN_REVIEW,
            reason="Invoice number is missing or unreadable.",
        )
    if not invoice.purchase_order:
        return WorkflowResult(
            status=WorkflowStatus.HUMAN_REVIEW,
            reason="Purchase-order number is missing or unreadable.",
        )
    purchase_order = purchase_orders.get(invoice.purchase_order)
    if purchase_order is None:
        return WorkflowResult(
            status=WorkflowStatus.HUMAN_REVIEW,
            reason="Purchase order was not found.",
        )
    if invoice.currency != purchase_order.currency or invoice.total != purchase_order.total:
        return WorkflowResult(
            status=WorkflowStatus.EXCEPTION,
            reason="Invoice and purchase-order amounts do not match.",
            expected_total=purchase_order.total,
            actual_total=invoice.total,
        )
    return WorkflowResult(
        status=WorkflowStatus.APPROVAL_REQUIRED,
        reason="Invoice and purchase order match; human approval is required.",
    )


def process_fixture(filename: str) -> WorkflowResult:
    return process_invoice(load_invoice(filename), load_purchase_orders())
