"""Deterministic test runner for the synthetic invoice workflow."""

import csv
import json
from pathlib import Path

from app.models.test_result import TestResult
from app.models.workflow import WorkflowIR


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _load_case(filename: str) -> dict[str, object]:
    with (_repo_root() / "examples" / "invoice-approval" / "invoices" / filename).open(
        encoding="utf-8"
    ) as file:
        return json.load(file)


def _load_purchase_orders() -> dict[str, dict[str, str]]:
    with (_repo_root() / "examples" / "invoice-approval" / "purchase_orders.csv").open(
        newline="", encoding="utf-8"
    ) as file:
        return {row["purchase_order"]: row for row in csv.DictReader(file)}


def evaluate_invoice_case(filename: str) -> tuple[str, str]:
    case = _load_case(filename)
    if (
        case.get("unreadable_invoice_number")
        or not case.get("invoice_number")
        or not case.get("purchase_order")
    ):
        return "human_review", "Required invoice identifiers are missing or unreadable."
    purchase_order = _load_purchase_orders().get(str(case["purchase_order"]))
    if not purchase_order:
        return (
            "human_review",
            "The purchase order was not found, so a safe comparison is not possible.",
        )
    invoice_total, po_total = float(case["total"]), float(purchase_order["total"])
    if invoice_total == po_total:
        return (
            "approved",
            f"Totals match at {invoice_total:.2f} {case['currency']}; "
            "a human approval gate remains.",
        )
    return "exception", f"Invoice total {invoice_total:.2f} differs from PO total {po_total:.2f}."


def run_invoice_tests(workflow: WorkflowIR) -> list[TestResult]:
    results: list[TestResult] = []
    for test in workflow.tests:
        filename = str(test.input_case.get("invoice_file", ""))
        actual, explanation = evaluate_invoice_case(filename)
        status = "passed" if actual == test.expected_outcome else "failed"
        if actual == "human_review":
            status = "human_review" if actual == test.expected_outcome else "failed"
        results.append(
            TestResult(
                id=test.id,
                name=test.name,
                input_case={"invoice_file": filename},
                expected_outcome=test.expected_outcome,
                actual_outcome=actual,
                status=status,
                explanation=explanation,
            )
        )
    return results
