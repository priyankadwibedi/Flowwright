"""OpenAI Responses API workflow inference behind a strict typed draft."""

import logging
import re
from collections.abc import Mapping
from datetime import UTC, datetime

from openai import OpenAI

from app.core.config import Settings
from app.models.workflow import (
    AnalyzeRequest,
    WorkflowApproval,
    WorkflowDecision,
    WorkflowDraft,
    WorkflowEdge,
    WorkflowInput,
    WorkflowIR,
    WorkflowStep,
    WorkflowVariable,
)

logger = logging.getLogger(__name__)


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:60] or "workflow"


def _evidence_ids(request: AnalyzeRequest) -> set[str]:
    if request.processed_demonstration:
        return {item.id for item in request.processed_demonstration.evidence_timeline}
    return {str(item.get("id")) for item in request.browser_event_log or [] if item.get("id")}


def _draft_to_ir(draft: WorkflowDraft, request: AnalyzeRequest) -> WorkflowIR:
    valid_evidence = _evidence_ids(request)
    referenced = {
        evidence_id
        for step in draft.steps
        for evidence_id in step.evidence_ids
    } | {
        evidence_id
        for variable in draft.variables
        for evidence_id in variable.evidence_ids
    } | {
        evidence_id
        for decision in draft.decisions
        for evidence_id in decision.evidence_ids
    } | {
        evidence_id
        for approval in draft.approvals
        for evidence_id in approval.evidence_ids
    }
    if not valid_evidence:
        raise ValueError("Workflow inference requires processed evidence with stable IDs")
    unknown = referenced - valid_evidence
    if unknown:
        raise ValueError("Workflow draft references evidence that was not supplied")
    step_ids = {step.id for step in draft.steps}
    if any(
        dependency not in step_ids
        for step in draft.steps
        for dependency in step.depends_on
    ):
        raise ValueError("Workflow draft contains an unknown step dependency")
    if any(
        target not in step_ids
        for decision in draft.decisions
        for target in (
            decision.source_step_id,
            decision.true_target_step_id,
            decision.false_target_step_id,
        )
    ):
        raise ValueError("Workflow draft contains an unknown decision target")
    if any(
        approval.required_before_step_id not in step_ids for approval in draft.approvals
    ):
        raise ValueError("Workflow draft contains an unknown approval step")
    steps = [
        WorkflowStep(
            id=step.id,
            name=step.name,
            type=step.type,
            description=step.description,
            depends_on=step.depends_on,
            input_refs=step.input_refs,
            output_refs=step.output_refs,
            configuration={entry.key: entry.value for entry in step.configuration},
            requires_ai=step.requires_ai,
            requires_approval=step.requires_approval,
            confidence=step.confidence,
            evidence_ids=step.evidence_ids,
        )
        for step in draft.steps
    ]
    decisions = [
        WorkflowDecision(
            id=decision.id,
            name=decision.name,
            description=decision.description,
            condition=decision.condition,
            true_step_id=decision.true_target_step_id,
            false_step_id=decision.false_target_step_id,
            source_step_id=decision.source_step_id,
            confidence=decision.confidence,
            evidence_ids=decision.evidence_ids,
        )
        for decision in draft.decisions
    ]
    edges: list[WorkflowEdge] = []
    for decision in decisions:
        if decision.source_step_id:
            edges.extend(
                [
                    WorkflowEdge(
                        id=f"{decision.id}-true",
                        source_step_id=decision.source_step_id,
                        target_step_id=decision.true_step_id,
                        kind="true",
                        condition=decision.condition,
                        label="true",
                    ),
                    WorkflowEdge(
                        id=f"{decision.id}-false",
                        source_step_id=decision.source_step_id,
                        target_step_id=decision.false_step_id,
                        kind="false",
                        condition=decision.condition,
                        label="false",
                    ),
                ]
            )
    for step in steps:
        for dependency in step.depends_on:
            if not any(
                edge.source_step_id == dependency and edge.target_step_id == step.id
                for edge in edges
            ):
                edges.append(
                    WorkflowEdge(
                        id=f"{dependency}-{step.id}",
                        source_step_id=dependency,
                        target_step_id=step.id,
                        kind="success",
                        condition=None,
                        label="next",
                    )
                )
    variables = [
        WorkflowVariable(
            id=variable.id,
            name=variable.name,
            description=variable.description,
            data_type=variable.data_type,
            source=variable.source,
            sensitive=False,
            constant=False,
            confidence=variable.confidence,
            evidence_ids=variable.evidence_ids,
        )
        for variable in draft.variables
    ]
    approvals = [
        WorkflowApproval(
            id=approval.id,
            name=approval.name,
            description=approval.description,
            trigger=approval.protected_action,
            step_id=approval.required_before_step_id,
            evidence_ids=approval.evidence_ids,
        )
        for approval in draft.approvals
    ]
    confidence_values = [step.confidence for step in draft.steps] + [
        variable.confidence for variable in draft.variables
    ]
    if draft.decisions:
        confidence_values.extend(decision.confidence for decision in draft.decisions)
    return WorkflowIR(
        id=_slug(draft.name),
        name=draft.name,
        description=draft.description,
        version="0.1.0",
        inputs=[
            WorkflowInput(
                id="demonstration_input",
                name="Demonstration input",
                description="Input represented by the processed browser demonstration.",
                data_type="record",
                required=True,
            )
        ],
        variables=variables,
        steps=steps,
        decisions=decisions,
        approvals=approvals,
        edges=edges,
        uncertainties=draft.uncertainties,
        tests=[],
        confidence=sum(confidence_values) / len(confidence_values) if confidence_values else 0.0,
        created_at=datetime.now(UTC),
    )


class OpenAIWorkflowAnalyzer:
    def __init__(self, settings: Settings) -> None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required when AI analysis is requested")
        if not settings.openai_model:
            raise RuntimeError("OPENAI_MODEL is required when AI analysis is requested")
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
        processed_demonstration=None,
    ) -> WorkflowIR:
        request = AnalyzeRequest(
            task_description=task_description,
            transcript=transcript,
            browser_event_log=[dict(item) for item in browser_event_log or []] or None,
            screenshots=screenshots,
            processed_demonstration=processed_demonstration,
        )
        if not processed_demonstration:
            raise ValueError("Process the demonstration before requesting AI workflow inference")
        evidence_summary = "\n".join(
            f"{item.id} @ {item.timestamp_seconds:.3f}s [{item.source}]: {item.content}"
            for item in processed_demonstration.evidence_timeline
        )
        prompt = (
            "Infer a browser workflow from the evidence. Distinguish meaningful actions, "
            "accidental actions, constants, variables, decisions, repeated patterns, "
            "exceptions, human judgment, safety boundaries, approval requirements, "
            "missing information, and uncertainty. Every inferred step, variable, and "
            "decision must reference supplied evidence IDs. Never claim certainty "
            "without evidence.\n\n"
            f"Task description:\n{task_description}\n\n"
            f"Transcript:\n{processed_demonstration.transcript}\n\n"
            f"Evidence timeline:\n{evidence_summary}"
        )
        content: list[dict[str, object]] = [{"type": "input_text", "text": prompt}]
        for frame in processed_demonstration.frames:
            content.append(
                {
                    "type": "input_image",
                    "image_url": f"data:{frame.mime_type};base64,{frame.image_base64}",
                }
            )
        for screenshot in request.screenshots or []:
            image_url = (
                screenshot
                if screenshot.startswith(("data:", "http://", "https://"))
                else f"data:image/png;base64,{screenshot}"
            )
            content.append({"type": "input_image", "image_url": image_url})
        logger.info(
            "workflow analysis request model=%s event_count=%s frame_count=%s",
            self.settings.openai_model,
            len(processed_demonstration.browser_events),
            len(processed_demonstration.frames),
        )
        response = self.client.responses.parse(
            model=self.settings.openai_model,
            input=[{"role": "user", "content": content}],
            text_format=WorkflowDraft,
        )
        draft = getattr(response, "output_parsed", None)
        if draft is None:
            raise ValueError("OpenAI returned no parsed WorkflowDraft")
        return _draft_to_ir(draft, request)
