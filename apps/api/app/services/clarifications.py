"""Clarification answer application for WorkflowIR / compiler configuration."""

from app.models.workflow import (
    ClarificationAnswer,
    ResolveResponse,
    WorkflowIR,
    WorkflowStep,
    WorkflowUncertainty,
)


class ClarificationError(ValueError):
    """Raised when clarification answers are invalid."""


def _apply_answer(
    workflow: WorkflowIR,
    uncertainty: WorkflowUncertainty,
    answer: str,
) -> WorkflowIR:
    target = uncertainty.resolution_target or uncertainty.id
    normalized = answer.strip().lower()

    if uncertainty.answer_type == "boolean":
        if normalized not in {"true", "false", "yes", "no"}:
            raise ClarificationError(f"Boolean answer expected for {uncertainty.id}")
        normalized = "true" if normalized in {"true", "yes"} else "false"

    if uncertainty.answer_type == "single_select":
        options = [option.lower() for option in uncertainty.allowed_options]
        if options and normalized not in options:
            raise ClarificationError(
                f"Answer for {uncertainty.id} must be one of {uncertainty.allowed_options}"
            )

    steps = list(workflow.steps)

    def update_step(step_id: str, key: str, value: str) -> list[WorkflowStep]:
        updated: list[WorkflowStep] = []
        for step in steps:
            if step.id == step_id:
                configuration = {**step.configuration, key: value}
                updated.append(step.model_copy(update={"configuration": configuration}))
            else:
                updated.append(step)
        return updated

    if (
        target in {"exception-delivery", "exception_delivery"}
        or uncertainty.id == "exception-delivery"
    ):
        flag_ids = uncertainty.affected_step_ids or ["flag_exception"]
        for step_id in flag_ids:
            if normalized not in {"draft", "human_review"}:
                raise ClarificationError("exception-delivery must be draft or human_review")
            steps = update_step(step_id, "delivery", normalized)
        return workflow.model_copy(update={"steps": steps})

    if target in {"amount_tolerance", "tolerance"}:
        compare_ids = [
            step.id
            for step in workflow.steps
            if step.type == "condition" and ("total" in step.id or "amount" in step.id)
        ] or uncertainty.affected_step_ids
        for step_id in compare_ids:
            steps = update_step(step_id, "tolerance", normalized)
        return workflow.model_copy(update={"steps": steps})

    if target in {"compare_currency"}:
        for step in workflow.steps:
            if step.type == "condition":
                steps = update_step(step.id, "compare_currency", normalized)
                break
        return workflow.model_copy(update={"steps": steps})

    # Generic: store answer onto affected step configuration under resolution_target.
    if uncertainty.affected_step_ids and target:
        for step_id in uncertainty.affected_step_ids:
            steps = update_step(step_id, target, answer.strip())
        return workflow.model_copy(update={"steps": steps})

    raise ClarificationError(
        f"No resolution target could be applied for question {uncertainty.id}"
    )


def apply_clarifications(
    workflow: WorkflowIR,
    answers: list[ClarificationAnswer],
) -> ResolveResponse:
    if not answers:
        remaining = list(workflow.uncertainties)
        required = [item for item in remaining if item.required]
        optional = [item for item in remaining if not item.required]
        return ResolveResponse(
            workflow=workflow,
            remaining_uncertainties=remaining,
            remaining_required=required,
            remaining_optional=optional,
            generation_ready=workflow.workflow_kind == "invoice_approval" and not required,
        )

    known = {item.id: item for item in workflow.uncertainties}
    seen: set[str] = set()
    updated = workflow

    for answer in answers:
        if answer.question_id not in known:
            raise ClarificationError(f"Unknown clarification question ID: {answer.question_id}")
        if answer.question_id in seen:
            raise ClarificationError(f"Duplicate answer for question ID: {answer.question_id}")
        seen.add(answer.question_id)
        uncertainty = known[answer.question_id]
        if (
            uncertainty.answer_type == "single_select"
            and uncertainty.allowed_options
            and answer.answer.strip().lower()
            not in {option.lower() for option in uncertainty.allowed_options}
        ):
            raise ClarificationError(
                f"Answer for {uncertainty.id} must be one of {uncertainty.allowed_options}"
            )
        updated = _apply_answer(updated, uncertainty, answer.answer)

    remaining = [
        uncertainty
        for uncertainty in updated.uncertainties
        if uncertainty.id not in seen
    ]
    updated = updated.model_copy(update={"uncertainties": remaining})
    required = [item for item in remaining if item.required]
    optional = [item for item in remaining if not item.required]
    return ResolveResponse(
        workflow=updated,
        remaining_uncertainties=remaining,
        remaining_required=required,
        remaining_optional=optional,
        generation_ready=updated.workflow_kind == "invoice_approval" and not required,
    )
