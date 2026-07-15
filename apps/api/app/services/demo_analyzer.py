"""Deterministic invoice analyzer used by the local prototype and judges."""

import json
from collections.abc import Mapping
from pathlib import Path

from app.models.workflow import WorkflowIR


def _fixture_path() -> Path:
    return (
        Path(__file__).resolve().parents[4]
        / "packages"
        / "sample-workflows"
        / "invoice-approval.json"
    )


class DemoWorkflowAnalyzer:
    def analyze(
        self,
        task_description: str,
        transcript: str | None = None,
        browser_event_log: list[Mapping[str, object]] | None = None,
        screenshots: list[str] | None = None,
    ) -> WorkflowIR:
        """Return a checked-in synthetic workflow regardless of the input wording."""
        del task_description, transcript, browser_event_log, screenshots
        with _fixture_path().open(encoding="utf-8") as fixture:
            return WorkflowIR.model_validate(json.load(fixture))
