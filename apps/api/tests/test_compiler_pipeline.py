"""Compiler, interpreter, artifact, and decimal contract tests."""

import io
import zipfile
from decimal import Decimal

from app.services.code_generator import generate_invoice_artifact
from app.services.demo_analyzer import DemoWorkflowAnalyzer
from app.services.invoice_compiler import (
    CompilerRejectedError,
    extract_invoice_compiler_config,
)
from app.services.invoice_interpreter import (
    InvoiceRecord,
    PurchaseOrderRecord,
    WorkflowStatus,
    interpret_invoice,
)
from app.services.invoice_runtime import process_fixture
from app.services.workflow_tester import run_broken_artifact_regression, run_invoice_tests


def _demo():
    return DemoWorkflowAnalyzer().analyze("invoice approval")


def test_workflow_kind_present_on_demo():
    workflow = _demo()
    assert workflow.workflow_kind == "invoice_approval"


def test_compiler_config_from_demo():
    config = extract_invoice_compiler_config(_demo())
    assert config.amount_tolerance == Decimal("0")
    assert config.exception_delivery == "draft"
    assert config.matching_action == "approval_required"


def test_false_string_parses_as_false_for_currency_compare():
    workflow = _demo()
    steps = [
        step.model_copy(
            update={"configuration": {**step.configuration, "compare_currency": "false"}}
        )
        if step.id == "compare_totals"
        else step
        for step in workflow.steps
    ]
    config = extract_invoice_compiler_config(workflow.model_copy(update={"steps": steps}))
    assert config.compare_currency is False


def test_tolerance_changes_generated_source_and_behavior():
    workflow = _demo()
    baseline = generate_invoice_artifact(workflow)
    steps = []
    for step in workflow.steps:
        if step.id == "compare_totals":
            steps.append(
                step.model_copy(
                    update={"configuration": {**step.configuration, "tolerance": "100"}}
                )
            )
        else:
            steps.append(step)
    tolerant = workflow.model_copy(update={"steps": steps})
    changed = generate_invoice_artifact(tolerant)
    assert baseline.compiler_fingerprint != changed.compiler_fingerprint
    assert 'AMOUNT_tolerance": "100"' in changed.files[0].content.replace(" ", "") or (
        'Decimal("100")' in changed.files[0].content
    )
    result = process_fixture("invoice-amount-mismatch.json", tolerant)
    assert result.status is WorkflowStatus.APPROVAL_REQUIRED


def test_exception_delivery_changes_source_and_behavior():
    workflow = _demo()
    steps = []
    for step in workflow.steps:
        if step.id == "flag_exception":
            steps.append(
                step.model_copy(
                    update={
                        "configuration": {
                            **step.configuration,
                            "delivery": "human_review",
                        }
                    }
                )
            )
        else:
            steps.append(step)
    updated = workflow.model_copy(update={"steps": steps})
    artifact = generate_invoice_artifact(updated)
    assert "EXCEPTION_DELIVERY = \"human_review\"" in artifact.files[0].content
    result = process_fixture("invoice-amount-mismatch.json", updated)
    assert result.status is WorkflowStatus.HUMAN_REVIEW


def test_removing_approval_gate_blocks_compilation():
    workflow = _demo()
    blocked = workflow.model_copy(update={"approvals": []})
    # Keep approval-typed step but remove gates and approval flags that rely on gates.
    steps = [
        step.model_copy(update={"requires_approval": False, "type": "write"})
        if step.type == "approval"
        else step.model_copy(update={"requires_approval": False})
        for step in blocked.steps
    ]
    blocked = blocked.model_copy(update={"steps": steps, "approvals": []})
    try:
        extract_invoice_compiler_config(blocked)
        raise AssertionError("expected CompilerRejectedError")
    except CompilerRejectedError:
        pass


def test_accidental_required_step_blocks_compilation():
    workflow = _demo()
    steps = [
        step.model_copy(update={"accidental": True})
        if step.id == "lookup_po"
        else step
        for step in workflow.steps
    ]
    try:
        extract_invoice_compiler_config(workflow.model_copy(update={"steps": steps}))
        raise AssertionError("expected CompilerRejectedError")
    except CompilerRejectedError as exc:
        assert "purchase-order lookup" in str(exc)


def test_invalid_edges_block_compilation():
    workflow = _demo()
    edges = list(workflow.edges)
    edges[0] = edges[0].model_copy(update={"target_step_id": "missing-step"})
    broken = workflow.model_copy(update={"edges": edges})
    try:
        extract_invoice_compiler_config(broken)
        raise AssertionError("expected CompilerRejectedError")
    except CompilerRejectedError:
        pass


def test_unsupported_kind_blocks_compilation():
    workflow = _demo().model_copy(update={"workflow_kind": "unsupported"})
    try:
        extract_invoice_compiler_config(workflow)
        raise AssertionError("expected CompilerRejectedError")
    except CompilerRejectedError:
        pass


def test_decimal_precision_and_currency():
    config = extract_invoice_compiler_config(_demo())
    invoice = InvoiceRecord(
        invoice_number="INV",
        purchase_order="PO",
        total=Decimal("0.1") + Decimal("0.2"),
        currency="USD",
    )
    pos = {"PO": PurchaseOrderRecord(purchase_order="PO", total=Decimal("0.3"), currency="USD")}
    assert interpret_invoice(invoice, pos, config).status is WorkflowStatus.APPROVAL_REQUIRED

    one_cent = InvoiceRecord(
        invoice_number="INV",
        purchase_order="PO",
        total=Decimal("1250.01"),
        currency="USD",
    )
    pos2 = {
        "PO": PurchaseOrderRecord(purchase_order="PO", total=Decimal("1250.00"), currency="USD")
    }
    assert interpret_invoice(one_cent, pos2, config).status is WorkflowStatus.EXCEPTION

    currency = InvoiceRecord(
        invoice_number="INV",
        purchase_order="PO",
        total=Decimal("1250.00"),
        currency="EUR",
    )
    assert interpret_invoice(currency, pos2, config).status is WorkflowStatus.EXCEPTION


def test_generated_artifact_execution(client):
    workflow = client.get("/api/v1/workflows/demo").json()
    response = client.post("/api/v1/workflows/test", json=workflow)
    assert response.status_code == 200
    body = response.json()
    assert body["artifact_execution"]["exit_code"] == 0
    assert body["failed"] == 0
    assert body["mandatory_test_count"] == 6
    assert body["optional_test_count"] == 0
    assert body["compiler_fingerprint"]


def test_mandatory_tests_cannot_be_skipped():
    workflow = _demo().model_copy(update={"tests": []})
    run = run_invoice_tests(workflow)
    assert run.mandatory_test_count == 6
    assert {execution.test_id for execution in run.executions} >= {
        "exact_match",
        "amount_mismatch",
        "missing_purchase_order",
        "unreadable_invoice_number",
        "currency_mismatch",
        "decimal_tolerance_boundary",
    }


def test_generated_test_environment_is_scrubbed(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-should-not-leak")
    run = run_invoice_tests(_demo())
    assert run.artifact_execution is not None
    combined = run.artifact_execution.stdout + run.artifact_execution.stderr
    assert "sk-should-not-leak" not in combined
    assert run.artifact_execution.exit_code == 0


def test_broken_artifact_regression():
    result = run_broken_artifact_regression(_demo())
    assert result.executions[0].status == "passed"
    assert result.artifact_execution is not None
    assert result.artifact_execution.exit_code != 0


def test_contract_paths_agree():
    workflow = _demo()
    runtime = process_fixture("invoice-exact-match.json", workflow)
    artifact = generate_invoice_artifact(workflow)
    assert "APPROVAL_REQUIRED" in artifact.files[0].content
    assert runtime.status is WorkflowStatus.APPROVAL_REQUIRED
    run = run_invoice_tests(workflow)
    exact = next(item for item in run.executions if "exact-match" in item.name)
    assert exact.actual_outcome == "approval_required"


def test_integration_mocked_ai_invoice_loop(client):
    workflow = _demo()
    workflow = workflow.model_copy(update={"id": "ai-inferred-invoice-workflow"})
    payload = workflow.model_dump(mode="json")
    generate = client.post("/api/v1/workflows/generate", json=payload)
    assert generate.status_code == 200
    artifact = client.post("/api/v1/workflows/artifact", json=payload)
    assert artifact.status_code == 200
    with zipfile.ZipFile(io.BytesIO(artifact.content)) as archive:
        workflow_source = archive.read("workflow.py").decode("utf-8")
    generated_source = next(
        file["content"] for file in generate.json()["files"] if file["path"] == "workflow.py"
    )
    assert workflow_source == generated_source
    test = client.post("/api/v1/workflows/test", json=payload)
    assert test.status_code == 200
    assert test.json()["artifact_execution"]["exit_code"] == 0
    process = client.post(
        "/api/v1/invoices/process",
        json={"invoice_file": "invoice-exact-match.json", "workflow": payload},
    )
    assert process.status_code == 200
    assert process.json()["status"] == "approval_required"


def test_path_traversal_rejected(client):
    response = client.post(
        "/api/v1/invoices/process",
        json={"invoice_file": "../secrets.json"},
    )
    assert response.status_code == 422


def test_resolve_unknown_and_options(client):
    workflow = client.get("/api/v1/workflows/demo").json()
    unknown = client.post(
        "/api/v1/workflows/resolve",
        json={"workflow": workflow, "answers": [{"question_id": "nope", "answer": "draft"}]},
    )
    assert unknown.status_code == 422
    bad = client.post(
        "/api/v1/workflows/resolve",
        json={
            "workflow": workflow,
            "answers": [{"question_id": "exception-delivery", "answer": "email"}],
        },
    )
    assert bad.status_code == 422
    ok = client.post(
        "/api/v1/workflows/resolve",
        json={
            "workflow": workflow,
            "answers": [{"question_id": "exception-delivery", "answer": "human_review"}],
        },
    )
    assert ok.status_code == 200
    assert ok.json()["generation_ready"] is True
    step = next(
        item for item in ok.json()["workflow"]["steps"] if item["id"] == "flag_exception"
    )
    assert step["configuration"]["delivery"] == "human_review"


def test_unknown_correction_id_returns_422(client):
    workflow = client.get("/api/v1/workflows/demo").json()
    response = client.post(
        "/api/v1/workflows/correct",
        json={
            "workflow": workflow,
            "corrections": [{"step_id": "missing-step", "accidental": True}],
        },
    )
    assert response.status_code == 422
    assert "Unknown correction step_id" in response.json()["detail"]
