"""OpenAI-backed analyzer, isolated from the deterministic demo path."""

import json
import logging
from collections.abc import Mapping

from openai import OpenAI

from app.core.config import Settings
from app.models.workflow import WorkflowIR

logger = logging.getLogger(__name__)


class OpenAIWorkflowAnalyzer:
    def __init__(self, settings: Settings) -> None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required when demo mode is disabled")
        if not settings.openai_model:
            raise RuntimeError("OPENAI_MODEL is required when demo mode is disabled")
        self.settings = settings
        self.client = OpenAI(
            api_key=settings.openai_api_key,
            timeout=settings.openai_timeout_seconds,
            max_retries=settings.openai_max_retries,
        )

    def analyze(
        self,
        task_description: str,
        transcript: str | None = None,
        browser_event_log: list[Mapping[str, object]] | None = None,
        screenshots: list[str] | None = None,
    ) -> WorkflowIR:
        payload = {
            "task_description": task_description,
            "transcript": transcript,
            "browser_event_log": browser_event_log,
            "screenshots": screenshots,
            "instructions": (
                "Compile a browser workflow into WorkflowIR. Distinguish constants, variables, "
                "decisions, accidental actions, human judgment, safety boundaries, and "
                "uncertainty. "
                "Return only JSON matching the supplied schema."
            ),
        }
        logger.info(
            "workflow analysis request model=%s event_count=%s",
            self.settings.openai_model,
            len(browser_event_log or []),
        )
        response = self.client.responses.create(
            model=self.settings.openai_model,
            input=json.dumps(payload, default=str),
            text={
                "format": {
                    "type": "json_schema",
                    "name": "workflow_ir",
                    "strict": True,
                    "schema": WorkflowIR.model_json_schema(),
                }
            },
        )
        output = getattr(response, "output_text", "")
        if not output:
            raise ValueError("OpenAI returned no structured workflow output")
        return WorkflowIR.model_validate_json(output)
