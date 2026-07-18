"""Semantic WorkflowIR validation coverage."""

import pytest

from app.services.demo_analyzer import DemoWorkflowAnalyzer
from app.services.workflow_validation import WorkflowValidationError, validate_workflow_ir


def _demo():
    return DemoWorkflowAnalyzer().analyze("invoice approval")


def test_valid_demo_passes():
    validate_workflow_ir(_demo())


def test_duplicate_step_ids():
    workflow = _demo()
    steps = list(workflow.steps)
    steps[1] = steps[1].model_copy(update={"id": steps[0].id})
    with pytest.raises(WorkflowValidationError, match="Duplicate step"):
        validate_workflow_ir(workflow.model_copy(update={"steps": steps}))


def test_unknown_dependency():
    workflow = _demo()
    steps = list(workflow.steps)
    steps[1] = steps[1].model_copy(update={"depends_on": ["missing"]})
    with pytest.raises(WorkflowValidationError, match="unknown step"):
        validate_workflow_ir(workflow.model_copy(update={"steps": steps}))


def test_self_dependency():
    workflow = _demo()
    steps = list(workflow.steps)
    steps[1] = steps[1].model_copy(update={"depends_on": [steps[1].id]})
    with pytest.raises(WorkflowValidationError, match="itself"):
        validate_workflow_ir(workflow.model_copy(update={"steps": steps}))


def test_unknown_edge_target():
    workflow = _demo()
    edges = list(workflow.edges)
    edges[0] = edges[0].model_copy(update={"target_step_id": "nope"})
    with pytest.raises(WorkflowValidationError, match="unknown steps"):
        validate_workflow_ir(workflow.model_copy(update={"edges": edges}))


def test_cycle_rejected():
    workflow = _demo()
    steps = list(workflow.steps)
    # Create A depends on B and B depends on A among first two non-input-ish steps.
    a = steps[1]
    b = steps[2]
    steps[1] = a.model_copy(update={"depends_on": [b.id]})
    steps[2] = b.model_copy(update={"depends_on": [a.id]})
    with pytest.raises(WorkflowValidationError, match="cycle"):
        validate_workflow_ir(
            workflow.model_copy(update={"steps": steps, "edges": []})
        )


def test_approval_step_requires_gate():
    workflow = _demo()
    with pytest.raises(WorkflowValidationError, match="approval gate"):
        validate_workflow_ir(workflow.model_copy(update={"approvals": []}))


def test_ai_step_requires_evidence_when_demonstration_present():
    workflow = _demo().model_copy(update={"demonstration_id": "demo-1"})
    steps = [
        step.model_copy(update={"evidence_ids": []}) if step.requires_ai else step
        for step in workflow.steps
    ]
    with pytest.raises(WorkflowValidationError, match="evidence"):
        validate_workflow_ir(workflow.model_copy(update={"steps": steps}))


def test_unreachable_non_accidental_step_rejected():
    workflow = _demo()
    orphan = workflow.steps[0].model_copy(
        update={
            "id": "orphan_step",
            "name": "Orphan step",
            "type": "transform",
            "depends_on": [],
            "accidental": False,
            "requires_approval": False,
        }
    )
    with pytest.raises(WorkflowValidationError, match="Unreachable"):
        validate_workflow_ir(
            workflow.model_copy(update={"steps": [*workflow.steps, orphan]})
        )


def test_unreachable_accidental_step_is_allowed():
    workflow = _demo()
    orphan = workflow.steps[0].model_copy(
        update={
            "id": "orphan_accidental",
            "name": "Accidental orphan",
            "type": "transform",
            "depends_on": [],
            "accidental": True,
            "requires_approval": False,
        }
    )
    validate_workflow_ir(
        workflow.model_copy(update={"steps": [*workflow.steps, orphan]})
    )
