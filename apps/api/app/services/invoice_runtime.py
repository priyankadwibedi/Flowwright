"""Restricted invoice runtime backed by the shared InvoiceCompilerConfig interpreter."""

import csv
from pathlib import Path

from app.models.workflow import INVOICE_FIXTURES, WorkflowIR
from app.services.invoice_compiler import (
    InvoiceCompilerConfig,
    extract_invoice_compiler_config,
)
from app.services.invoice_interpreter import (
    InvoiceRecord,
    PurchaseOrderRecord,
    WorkflowResult,
    WorkflowStatus,
    interpret_invoice,
)

__all__ = [
    "InvoiceRecord",
    "PurchaseOrderRecord",
    "WorkflowResult",
    "WorkflowStatus",
    "approve_fixture",
    "default_config",
    "load_invoice",
    "load_purchase_orders",
    "process_fixture",
    "process_invoice",
    "resolve_config",
]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def fixtures_dir() -> Path:
    return repo_root() / "examples" / "invoice-approval" / "invoices"


def resolve_fixture_path(filename: str) -> Path:
    if filename not in INVOICE_FIXTURES:
        raise ValueError(f"Invoice fixture is not allowlisted: {filename}")
    base = fixtures_dir().resolve()
    path = (base / filename).resolve()
    if not path.is_relative_to(base):
        raise ValueError("Path traversal rejected for invoice fixture")
    if not path.is_file():
        raise ValueError(f"Synthetic invoice fixture not found: {filename}")
    return path


def load_invoice(filename: str) -> InvoiceRecord:
    path = resolve_fixture_path(filename)
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
                total=row["total"],
                currency=row.get("currency", "USD"),
            )
            for row in csv.DictReader(file)
        }


def default_config() -> InvoiceCompilerConfig:
    return InvoiceCompilerConfig()


def resolve_config(workflow: WorkflowIR | None = None) -> InvoiceCompilerConfig:
    if workflow is None:
        return default_config()
    return extract_invoice_compiler_config(workflow)


def process_invoice(
    invoice: InvoiceRecord,
    purchase_orders: dict[str, PurchaseOrderRecord],
    config: InvoiceCompilerConfig | None = None,
) -> WorkflowResult:
    return interpret_invoice(invoice, purchase_orders, config or default_config())


def process_fixture(
    filename: str,
    workflow: WorkflowIR | None = None,
) -> WorkflowResult:
    return process_invoice(
        load_invoice(filename),
        load_purchase_orders(),
        resolve_config(workflow),
    )


def approve_fixture(filename: str, workflow: WorkflowIR | None = None) -> str:
    """Record an explicit approval for synthetic data without external side effects."""
    import uuid

    result = process_fixture(filename, workflow)
    if result.status is not WorkflowStatus.APPROVAL_REQUIRED:
        raise ValueError("Only an exact-match synthetic invoice can be approved")
    return f"synthetic-receipt-{uuid.uuid4()}"
