"""Analyzer protocol shared by demo and OpenAI implementations."""

from collections.abc import Mapping
from typing import Protocol

from app.models.workflow import WorkflowIR


class WorkflowAnalyzer(Protocol):
    def analyze(
        self,
        task_description: str,
        transcript: str | None = None,
        browser_event_log: list[Mapping[str, object]] | None = None,
        screenshots: list[str] | None = None,
    ) -> WorkflowIR:
        """Compile a demonstration into validated WorkflowIR data."""
