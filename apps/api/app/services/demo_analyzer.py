"""Deterministic invoice analyzer used by the local prototype and judges."""

import json
from collections.abc import Mapping
from pathlib import Path

from app.models.workflow import ProcessedDemonstration, WorkflowIR


class DemoModeUnsupportedError(ValueError):
    """Raised when a non-invoice task is sent to the sample-only analyzer."""


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
        processed_demonstration: ProcessedDemonstration | None = None,
    ) -> WorkflowIR:
        """Return the checked-in sample only for an invoice-shaped task."""
        del transcript, browser_event_log, screenshots, processed_demonstration
        normalized = task_description.lower()
        if not any(
            term in normalized
            for term in ("invoice", "purchase order", "purchase-order", "po")
        ):
            raise DemoModeUnsupportedError(
                "Demo mode only supports the synthetic invoice workflow. "
                "Use the sample demo or configure OpenAI for another task."
            )
        with _fixture_path().open(encoding="utf-8") as fixture:
            return WorkflowIR.model_validate(json.load(fixture))
