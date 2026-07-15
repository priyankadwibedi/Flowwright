import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.models.workflow import WorkflowIR


def sample() -> dict:
    path = (
        Path(__file__).resolve().parents[3]
        / "packages"
        / "sample-workflows"
        / "invoice-approval.json"
    )
    return json.loads(path.read_text(encoding="utf-8"))


def test_invoice_sample_satisfies_schema():
    workflow = WorkflowIR.model_validate(sample())
    assert workflow.id == "invoice-approval-demo"
    assert len(workflow.steps) == 7


def test_invalid_workflow_rejected():
    payload = sample()
    payload["confidence"] = 2
    with pytest.raises(ValidationError):
        WorkflowIR.model_validate(payload)
