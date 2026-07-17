"""Coverage for OpenAI draft normalization helpers."""

from app.models.workflow import WorkflowStep
from app.services.openai_analyzer import _ensure_entry_input_step


def _step(**overrides: object) -> WorkflowStep:
    base = {
        "id": "s1",
        "name": "Step",
        "type": "ai_extract",
        "description": "desc",
        "depends_on": [],
        "input_refs": [],
        "output_refs": [],
        "configuration": {},
        "requires_ai": True,
        "requires_approval": False,
        "confidence": 0.5,
        "evidence_ids": ["ev-1"],
    }
    base.update(overrides)
    return WorkflowStep(**base)  # type: ignore[arg-type]


def test_keeps_existing_input_step():
    steps = [
        _step(id="in", type="input", requires_ai=False),
        _step(id="next", depends_on=["in"]),
    ]
    result = _ensure_entry_input_step(steps, {"ev-1"})
    assert [step.id for step in result] == ["in", "next"]
    assert result[0].type == "input"


def test_promotes_root_step_to_input():
    steps = [
        _step(id="upload", type="write", name="Upload invoice", requires_ai=False),
        _step(id="extract", depends_on=["upload"]),
    ]
    result = _ensure_entry_input_step(steps, {"ev-1", "ev-2"})
    assert result[0].id == "upload"
    assert result[0].type == "input"
    assert result[0].requires_ai is False
    assert result[1].type == "ai_extract"


def test_inserts_input_when_no_roots():
    steps = [
        _step(id="a", depends_on=["b"]),
        _step(id="b", depends_on=["a"]),
    ]
    result = _ensure_entry_input_step(steps, {"ev-9"})
    assert result[0].type == "input"
    assert result[0].id == "workflow-input"
    assert "workflow-input" in result[1].depends_on
    assert "workflow-input" in result[2].depends_on
