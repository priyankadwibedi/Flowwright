"""Regression tests for evidence vs workflow-data reference namespaces."""

from datetime import UTC, datetime

import pytest

from app.models.workflow import (
    AnalyzeRequest,
    EvidenceItem,
    ProcessedDemonstration,
    WorkflowApprovalDraft,
    WorkflowDraft,
    WorkflowEdge,
    WorkflowIR,
    WorkflowStep,
    WorkflowStepDraft,
)
from app.services.openai_analyzer import (
    DEFAULT_WORKFLOW_INPUTS,
    OpenAIWorkflowAnalyzer,
)
from app.services.workflow_reference_normalizer import (
    ReferenceNormalizationError,
    normalize_workflow_references,
    validate_reference_namespaces,
)
from app.services.workflow_validation import validate_workflow_ir


def _base_workflow(steps: list[WorkflowStep]) -> WorkflowIR:
    edges = []
    for step in steps:
        for dependency in step.depends_on:
            edges.append(
                WorkflowEdge(
                    id=f"{dependency}-{step.id}",
                    source_step_id=dependency,
                    target_step_id=step.id,
                    kind="success",
                    label="next",
                )
            )
    return WorkflowIR(
        id="test-workflow",
        name="Test",
        description="ref namespace tests",
        version="0.1.0",
        workflow_kind="invoice_approval",
        demonstration_id="demo-1",
        inputs=list(DEFAULT_WORKFLOW_INPUTS),
        variables=[],
        steps=steps,
        decisions=[],
        approvals=[],
        edges=edges,
        uncertainties=[],
        tests=[],
        confidence=0.8,
        created_at=datetime.now(UTC),
    )


def _step(**overrides: object) -> WorkflowStep:
    base = {
        "id": "step-1",
        "name": "Step",
        "type": "ai_extract",
        "description": "desc",
        "depends_on": [],
        "input_refs": [],
        "output_refs": [],
        "configuration": {},
        "requires_ai": True,
        "requires_approval": False,
        "confidence": 0.8,
        "evidence_ids": [],
    }
    base.update(overrides)
    return WorkflowStep(**base)  # type: ignore[arg-type]


def test_moves_evidence_from_input_refs():
    workflow = _base_workflow(
        [
            _step(id="step-1", type="input", requires_ai=False, output_refs=["invoice_document"]),
            _step(
                id="step-2",
                depends_on=["step-1"],
                input_refs=["frame-128"],
                evidence_ids=[],
                output_refs=["extracted_fields"],
            ),
        ]
    )
    result = normalize_workflow_references(workflow, {"frame-128"})
    step2 = next(step for step in result.workflow.steps if step.id == "step-2")
    assert step2.input_refs == []
    assert step2.evidence_ids == ["frame-128"]
    validate_reference_namespaces(result.workflow, {"frame-128"})
    validate_workflow_ir(result.workflow)


def test_mixed_valid_data_and_evidence():
    workflow = _base_workflow(
        [
            _step(
                id="step-1",
                type="input",
                requires_ai=False,
                input_refs=["invoice_document"],
                output_refs=["received"],
            ),
            _step(
                id="step-2",
                depends_on=["step-1"],
                input_refs=["invoice_document", "frame-128"],
                evidence_ids=[],
                output_refs=["extracted_fields"],
            ),
        ]
    )
    result = normalize_workflow_references(workflow, {"frame-128"})
    step2 = next(step for step in result.workflow.steps if step.id == "step-2")
    assert step2.input_refs == ["invoice_document"]
    assert step2.evidence_ids == ["frame-128"]


def test_unknown_evidence_is_dropped_or_remapped():
    workflow = _base_workflow(
        [
            _step(id="step-1", type="input", requires_ai=False),
            _step(
                id="step-2",
                depends_on=["step-1"],
                evidence_ids=["frame-999999", "frame-128"],
                requires_ai=True,
            ),
        ]
    )
    result = normalize_workflow_references(workflow, {"frame-0", "frame-1"})
    step2 = next(step for step in result.workflow.steps if step.id == "step-2")
    assert "frame-999999" not in step2.evidence_ids
    assert step2.evidence_ids  # remapped/fallback kept a real ID
    assert all(item.startswith("frame-") for item in step2.evidence_ids)
    assert any(
        warning.action in {"dropped_unknown_evidence", "remapped_evidence_id", "attached_fallback_evidence"}
        for warning in result.warnings
    )


def test_prompt_example_frame_128_remaps_to_real_frame():
    workflow = _base_workflow(
        [
            _step(
                id="extract",
                type="ai_extract",
                requires_ai=True,
                evidence_ids=["frame-128"],
                input_refs=["invoice_document"],
                output_refs=["fields"],
            )
        ]
    )
    result = normalize_workflow_references(workflow, {"frame-0", "frame-1", "frame-2"})
    extract = result.workflow.steps[0]
    assert extract.evidence_ids == ["frame-0"]
    validate_reference_namespaces(result.workflow, {"frame-0", "frame-1", "frame-2"})



def test_unknown_workflow_reference_rejected():
    workflow = _base_workflow(
        [
            _step(id="step-1", type="input", requires_ai=False),
            _step(
                id="step-2",
                depends_on=["step-1"],
                input_refs=["imaginary_invoice_record"],
            ),
        ]
    )
    with pytest.raises(ReferenceNormalizationError) as exc:
        normalize_workflow_references(workflow, {"frame-128"})
    assert any(
        issue.reference == "imaginary_invoice_record" for issue in exc.value.issues
    )


def test_removes_colliding_input_as_output_ref():
    workflow = _base_workflow(
        [
            _step(
                id="receive-invoice",
                type="input",
                requires_ai=False,
                input_refs=["invoice_document"],
                output_refs=["invoice_document"],
            ),
            _step(
                id="extract",
                depends_on=["receive-invoice"],
                requires_ai=False,
                input_refs=["invoice_document"],
                output_refs=["extracted_fields"],
            ),
        ]
    )
    workflow = workflow.model_copy(update={"demonstration_id": None})
    result = normalize_workflow_references(workflow, set())
    receive = next(step for step in result.workflow.steps if step.id == "receive-invoice")
    assert receive.input_refs == ["invoice_document"]
    assert receive.output_refs == []
    validate_reference_namespaces(result.workflow, set())
    validate_workflow_ir(result.workflow)


def test_previous_step_output_valid():
    workflow = _base_workflow(
        [
            _step(
                id="step-1",
                type="input",
                requires_ai=False,
                output_refs=["extracted_fields"],
            ),
            _step(
                id="step-2",
                depends_on=["step-1"],
                requires_ai=False,
                input_refs=["extracted_fields"],
                output_refs=["validated"],
            ),
        ]
    )
    workflow = workflow.model_copy(update={"demonstration_id": None})
    result = normalize_workflow_references(workflow, set())
    validate_reference_namespaces(result.workflow, set())
    validate_workflow_ir(result.workflow)


def test_future_step_output_rejected():
    workflow = _base_workflow(
        [
            _step(
                id="step-1",
                type="input",
                requires_ai=False,
                input_refs=["later_fields"],
                output_refs=["early"],
            ),
            _step(
                id="step-2",
                depends_on=["step-1"],
                requires_ai=False,
                output_refs=["later_fields"],
            ),
        ]
    )
    with pytest.raises(ReferenceNormalizationError):
        normalize_workflow_references(workflow, set())


def test_prompt_separates_namespaces():
    settings = type(
        "S",
        (),
        {
            "openai_api_key": "sk-test",
            "openai_model": "gpt-4o-mini",
            "openai_timeout_seconds": 30,
            "openai_max_retries": 0,
            "flowwright_ai_repair_enabled": False,
        },
    )()
    analyzer = OpenAIWorkflowAnalyzer.__new__(OpenAIWorkflowAnalyzer)
    analyzer.settings = settings  # type: ignore[attr-defined]
    demo = ProcessedDemonstration(
        demonstration_id="demo-1",
        duration_seconds=1.0,
        evidence_timeline=[
            EvidenceItem(
                id="frame-0",
                source="frame",
                observation_kind="direct",
                content="invoice",
                timestamp_seconds=0.0,
                confidence=1.0,
            ),
            EvidenceItem(
                id="frame-128",
                source="frame",
                observation_kind="direct",
                content="approval",
                timestamp_seconds=1.0,
                confidence=1.0,
            ),
        ],
    )
    prompt = OpenAIWorkflowAnalyzer._build_prompt(
        analyzer,
        "Approve invoices",
        demo,
        ["frame-0", "frame-128"],
    )
    assert "AVAILABLE WORKFLOW INPUT IDS:" in prompt
    assert "- invoice_document" in prompt
    assert "AVAILABLE EVIDENCE IDS:" in prompt
    assert "- frame-128" in prompt
    developer = OpenAIWorkflowAnalyzer._developer_instruction(
        analyzer,
        ["frame-0", "frame-128"],
    )
    assert "REFERENCE RULES" in developer
    assert "Never invent" in developer
    assert "frame-0" in developer
    assert "input_refs" in developer
    assert "evidence_ids" in developer


def test_finalize_normalizes_frame_in_input_refs():
    demo = ProcessedDemonstration(
        demonstration_id="demo-1",
        duration_seconds=1.0,
        frames=[],
        transcript="",
        evidence_timeline=[
            EvidenceItem(
                id="frame-128",
                source="frame",
                observation_kind="direct",
                content="invoice fields",
                timestamp_seconds=1.0,
                confidence=1.0,
            )
        ],
    )
    draft = WorkflowDraft(
        name="Invoice approval",
        description="demo",
        workflow_kind="invoice_approval",
        variables=[],
        steps=[
            WorkflowStepDraft(
                id="step-1",
                name="Receive invoice",
                type="input",
                description="upload",
                depends_on=[],
                input_refs=["invoice_document"],
                output_refs=["received_invoice"],
                configuration=[],
                requires_ai=False,
                requires_approval=False,
                confidence=0.9,
                evidence_ids=["frame-128"],
            ),
            WorkflowStepDraft(
                id="step-2",
                name="Extract fields",
                type="ai_extract",
                description="extract",
                depends_on=["step-1"],
                input_refs=["frame-128"],
                output_refs=["extracted_invoice_fields"],
                configuration=[],
                requires_ai=True,
                requires_approval=False,
                confidence=0.9,
                evidence_ids=[],
            ),
            WorkflowStepDraft(
                id="step-3",
                name="Approve",
                type="approval",
                description="approve",
                depends_on=["step-2"],
                input_refs=["extracted_invoice_fields"],
                output_refs=["approval_record"],
                configuration=[],
                requires_ai=False,
                requires_approval=True,
                confidence=0.9,
                evidence_ids=["frame-128"],
            ),
        ],
        decisions=[],
        approvals=[
            WorkflowApprovalDraft(
                id="gate-1",
                name="Approval gate",
                description="human gate",
                protected_action="approve_invoice",
                required_before_step_id="step-3",
                evidence_ids=["frame-128"],
            )
        ],
        uncertainties=[],
    )
    request = AnalyzeRequest(
        task_description="Approve invoices",
        processed_demonstration=demo,
    )
    settings = type(
        "S",
        (),
        {
            "openai_api_key": "sk-test",
            "openai_model": "gpt-4o-mini",
            "openai_timeout_seconds": 30,
            "openai_max_retries": 0,
            "flowwright_ai_repair_enabled": False,
        },
    )()
    analyzer = OpenAIWorkflowAnalyzer.__new__(OpenAIWorkflowAnalyzer)
    analyzer.settings = settings  # type: ignore[attr-defined]
    workflow = OpenAIWorkflowAnalyzer._finalize(
        analyzer,
        draft,
        request,
        {"frame-128"},
    )
    step2 = next(step for step in workflow.steps if step.id == "step-2")
    assert "frame-128" not in step2.input_refs
    assert "frame-128" in step2.evidence_ids
