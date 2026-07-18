"""Semantic-role compiler contract and compile-readiness regression tests."""

from datetime import UTC, datetime

import pytest

from app.models.workflow import (
    InvoiceStepRole,
    WorkflowApproval,
    WorkflowDecision,
    WorkflowEdge,
    WorkflowInput,
    WorkflowIR,
    WorkflowStep,
    WorkflowUncertainty,
)
from app.services.code_generator import generate_invoice_artifact
from app.services.compile_readiness import evaluate_compile_readiness
from app.services.demo_analyzer import DemoWorkflowAnalyzer
from app.services.invoice_compiler import (
    CompilerRejectedError,
    extract_invoice_compiler_config,
)
from app.services.invoice_workflow_normalizer import normalize_invoice_workflow


def _base_ai_inferred_workflow(*, include_roles: bool = True) -> WorkflowIR:
    """Regression fixture matching the current AI Flag Exception graph."""

    def role(value: InvoiceStepRole | None) -> InvoiceStepRole | None:
        return value if include_roles else None

    steps = [
        WorkflowStep(
            id="upload-invoice",
            name="Upload Invoice",
            type="input",
            description="Accept invoice upload",
            depends_on=[],
            input_refs=["invoice_document"],
            output_refs=["stored_invoice"],
            configuration={},
            requires_ai=False,
            requires_approval=False,
            confidence=0.9,
            evidence_ids=["frame-1"],
            semantic_role=role(InvoiceStepRole.INVOICE_INPUT),
        ),
        WorkflowStep(
            id="extract-invoice-fields",
            name="Extract Invoice Fields",
            type="ai_extract",
            description="Extract fields",
            depends_on=["upload-invoice"],
            input_refs=["stored_invoice"],
            output_refs=["extracted_fields"],
            configuration={},
            requires_ai=True,
            requires_approval=False,
            confidence=0.9,
            evidence_ids=["frame-2"],
            semantic_role=role(InvoiceStepRole.EXTRACT_FIELDS),
        ),
        WorkflowStep(
            id="lookup-purchase-order",
            name="Lookup Purchase Order",
            type="lookup",
            description="Lookup PO",
            depends_on=["extract-invoice-fields"],
            input_refs=["extracted_fields"],
            output_refs=["purchase_order_record"],
            configuration={},
            requires_ai=False,
            requires_approval=False,
            confidence=0.9,
            evidence_ids=["frame-3"],
            semantic_role=role(InvoiceStepRole.LOOKUP_PURCHASE_ORDER),
        ),
        WorkflowStep(
            id="compare-amounts",
            name="Compare Amounts",
            type="condition",
            description="Compare invoice and purchase-order totals",
            depends_on=["lookup-purchase-order"],
            input_refs=["extracted_fields", "purchase_order_record"],
            output_refs=["comparison_result"],
            configuration={"tolerance": 0},
            requires_ai=False,
            requires_approval=False,
            confidence=0.9,
            evidence_ids=["frame-4"],
            semantic_role=role(InvoiceStepRole.COMPARE_AMOUNTS),
        ),
        WorkflowStep(
            id="prepare-for-approval",
            name="Prepare for Approval",
            type="approval",
            description="Prepare matching invoice for approval",
            depends_on=["compare-amounts"],
            input_refs=["comparison_result"],
            output_refs=["approval_record"],
            configuration={},
            requires_ai=False,
            requires_approval=True,
            confidence=0.9,
            evidence_ids=["frame-5"],
            semantic_role=role(InvoiceStepRole.APPROVAL),
        ),
        WorkflowStep(
            id="flag-exception",
            name="Flag Exception",
            type="draft",
            description="Flag amount mismatch exception",
            depends_on=["compare-amounts"],
            input_refs=["comparison_result"],
            output_refs=["exception_record"],
            configuration={"delivery": "draft"},
            requires_ai=False,
            requires_approval=False,
            confidence=0.9,
            evidence_ids=["frame-6"],
            semantic_role=role(InvoiceStepRole.EXCEPTION),
        ),
        WorkflowStep(
            id="human-review",
            name="Human review",
            type="human_review",
            description="Review missing or unreadable fields",
            depends_on=["compare-amounts"],
            input_refs=["comparison_result"],
            output_refs=["review_record"],
            configuration={},
            requires_ai=False,
            requires_approval=True,
            confidence=0.85,
            evidence_ids=["frame-7"],
            semantic_role=role(InvoiceStepRole.HUMAN_REVIEW),
        ),
    ]
    return WorkflowIR(
        id="ai-inferred-invoice-approval",
        name="AI inferred invoice approval",
        description="Regression graph for Flag Exception draft role",
        version="0.1.0",
        workflow_kind="invoice_approval",
        demonstration_id="demo-regression-1",
        inputs=[
            WorkflowInput(
                id="invoice_document",
                name="Invoice",
                description="doc",
                data_type="document",
                required=True,
            )
        ],
        variables=[],
        steps=steps,
        decisions=[
            WorkflowDecision(
                id="amounts-match",
                name="Amounts match",
                description="Route match vs mismatch",
                condition="invoice_total == po_total",
                true_step_id="prepare-for-approval",
                false_step_id="flag-exception",
                source_step_id="compare-amounts",
            )
        ],
        approvals=[
            WorkflowApproval(
                id="approval-gate",
                name="Approval gate",
                description="Human must approve",
                trigger="amounts match",
                step_id="prepare-for-approval",
            ),
            WorkflowApproval(
                id="review-gate",
                name="Review gate",
                description="Human review",
                trigger="missing fields",
                step_id="human-review",
            ),
        ],
        edges=[
            WorkflowEdge(
                id="upload-extract",
                source_step_id="upload-invoice",
                target_step_id="extract-invoice-fields",
                kind="success",
                label="next",
            ),
            WorkflowEdge(
                id="extract-lookup",
                source_step_id="extract-invoice-fields",
                target_step_id="lookup-purchase-order",
                kind="success",
                label="next",
            ),
            WorkflowEdge(
                id="lookup-compare",
                source_step_id="lookup-purchase-order",
                target_step_id="compare-amounts",
                kind="success",
                label="next",
            ),
            WorkflowEdge(
                id="compare-true",
                source_step_id="compare-amounts",
                target_step_id="prepare-for-approval",
                kind="true",
                label="true",
            ),
            WorkflowEdge(
                id="compare-false",
                source_step_id="compare-amounts",
                target_step_id="flag-exception",
                kind="false",
                label="false",
            ),
            WorkflowEdge(
                id="compare-review",
                source_step_id="compare-amounts",
                target_step_id="human-review",
                kind="review",
                label="review",
            ),
        ],
        uncertainties=[],
        tests=[],
        confidence=0.91,
        created_at=datetime.now(UTC),
    )


def test_ai_exception_draft_role_compiles():
    config = extract_invoice_compiler_config(_base_ai_inferred_workflow())
    assert config.amount_mismatch_action == "exception"
    assert config.matching_action == "approval_required"
    assert config.exception_delivery == "draft"


def test_false_edge_to_exception_role_required():
    workflow = _base_ai_inferred_workflow()
    edges = [edge for edge in workflow.edges if edge.kind != "false"]
    broken = workflow.model_copy(update={"edges": edges, "decisions": []})
    with pytest.raises(CompilerRejectedError, match="false path"):
        extract_invoice_compiler_config(broken)


def test_true_edge_to_approval_role_required():
    workflow = _base_ai_inferred_workflow()
    edges = [edge for edge in workflow.edges if edge.kind != "true"]
    broken = workflow.model_copy(update={"edges": edges, "decisions": []})
    with pytest.raises(CompilerRejectedError, match="true path"):
        extract_invoice_compiler_config(broken)


def test_missing_exception_role_blocks():
    workflow = _base_ai_inferred_workflow()
    steps = [
        step.model_copy(update={"semantic_role": InvoiceStepRole.APPROVAL})
        if step.id == "flag-exception"
        else step
        for step in workflow.steps
        if step.id != "flag-exception"
    ]
    # Drop exception step entirely.
    broken = workflow.model_copy(
        update={
            "steps": steps,
            "edges": [edge for edge in workflow.edges if edge.target_step_id != "flag-exception"],
            "decisions": [],
        }
    )
    readiness = evaluate_compile_readiness(broken)
    assert readiness.ready is False
    assert any(blocker.code == "missing_exception_path" for blocker in readiness.blockers)


def test_required_clarification_blocks_readiness():
    workflow = _base_ai_inferred_workflow().model_copy(
        update={
            "uncertainties": [
                WorkflowUncertainty(
                    id="mismatch-delivery",
                    question="How should mismatches be delivered?",
                    reason="Needed for compiler config",
                    affected_step_ids=["flag-exception"],
                    required=True,
                    allowed_options=["draft", "human_review"],
                    resolution_target="exception-delivery",
                )
            ]
        }
    )
    readiness = evaluate_compile_readiness(workflow)
    assert readiness.ready is False
    assert readiness.blockers[0].code == "unresolved_required_clarification"


def test_resolved_clarification_enables_readiness(client):
    workflow = _base_ai_inferred_workflow().model_copy(
        update={
            "uncertainties": [
                WorkflowUncertainty(
                    id="mismatch-delivery",
                    question="How should mismatches be delivered?",
                    reason="Needed for compiler config",
                    affected_step_ids=["flag-exception"],
                    required=True,
                    allowed_options=["draft", "human_review"],
                    resolution_target="exception-delivery",
                )
            ]
        }
    )
    blocked = client.post(
        "/api/v1/workflows/compile-readiness",
        json={"workflow": workflow.model_dump(mode="json")},
    )
    assert blocked.status_code == 200
    assert blocked.json()["ready"] is False

    resolved = client.post(
        "/api/v1/workflows/resolve",
        json={
            "workflow": workflow.model_dump(mode="json"),
            "answers": [{"question_id": "mismatch-delivery", "answer": "draft"}],
        },
    )
    assert resolved.status_code == 200
    ready = client.post(
        "/api/v1/workflows/compile-readiness",
        json={"workflow": resolved.json()["workflow"]},
    )
    assert ready.status_code == 200
    assert ready.json()["ready"] is True


def test_generate_uses_same_readiness_service(client):
    workflow = _base_ai_inferred_workflow().model_copy(
        update={
            "uncertainties": [
                WorkflowUncertainty(
                    id="mismatch-delivery",
                    question="How should mismatches be delivered?",
                    reason="Needed",
                    affected_step_ids=["flag-exception"],
                    required=True,
                    allowed_options=["draft", "human_review"],
                    resolution_target="exception-delivery",
                )
            ]
        }
    )
    response = client.post(
        "/api/v1/workflows/generate",
        json=workflow.model_dump(mode="json"),
    )
    assert response.status_code == 422
    assert "Resolve" in response.json()["detail"] or "question" in response.json()["detail"].lower()


def test_sample_and_inferred_artifact_sources_differ():
    sample = DemoWorkflowAnalyzer().analyze("invoice approval")
    inferred = _base_ai_inferred_workflow()
    sample_artifact = generate_invoice_artifact(sample)
    inferred_artifact = generate_invoice_artifact(inferred)
    assert sample_artifact.workflow_source == "sample"
    assert inferred_artifact.workflow_source == "inferred"
    assert sample_artifact.workflow_id != inferred_artifact.workflow_id
    meta_sample = next(file for file in sample_artifact.files if file.path == "artifact_meta.json")
    meta_inferred = next(
        file for file in inferred_artifact.files if file.path == "artifact_meta.json"
    )
    assert '"workflow_source": "sample"' in meta_sample.content
    assert '"workflow_source": "inferred"' in meta_inferred.content


def test_legacy_sample_migrates_semantic_roles():
    sample = DemoWorkflowAnalyzer().analyze("invoice approval")
    # Strip roles to simulate legacy fixture storage.
    stripped = sample.model_copy(
        update={
            "steps": [
                step.model_copy(update={"semantic_role": None}) for step in sample.steps
            ]
        }
    )
    migrated = normalize_invoice_workflow(stripped).workflow
    roles = {step.id: step.semantic_role for step in migrated.steps}
    assert roles["flag_exception"] == InvoiceStepRole.EXCEPTION
    assert roles["approve_invoice"] == InvoiceStepRole.APPROVAL
    config = extract_invoice_compiler_config(stripped)
    assert config.matching_action == "approval_required"


def test_name_based_exception_without_role_still_migrates():
    workflow = _base_ai_inferred_workflow(include_roles=False)
    migrated = normalize_invoice_workflow(workflow).workflow
    exception = next(step for step in migrated.steps if step.id == "flag-exception")
    assert exception.semantic_role == InvoiceStepRole.EXCEPTION
    config = extract_invoice_compiler_config(workflow)
    assert config.amount_mismatch_action == "exception"
