"""Normalize WorkflowIR into a deterministic invoice compiler configuration."""

from decimal import Decimal, InvalidOperation
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.workflow import WorkflowIR

ExceptionAction = Literal["exception", "human_review"]
ReviewAction = Literal["human_review"]
MatchingAction = Literal["approval_required"]
ExceptionDelivery = Literal["draft", "human_review"]


class InvoiceCompilerConfig(BaseModel):
    """Trusted compiler configuration extracted from invoice WorkflowIR."""

    model_config = ConfigDict(extra="forbid")

    compare_currency: bool = True
    amount_tolerance: Decimal = Field(default=Decimal("0"))
    missing_invoice_number_action: ReviewAction = "human_review"
    missing_purchase_order_action: ReviewAction = "human_review"
    purchase_order_not_found_action: ReviewAction = "human_review"
    amount_mismatch_action: ExceptionAction = "exception"
    matching_action: MatchingAction = "approval_required"
    exception_delivery: ExceptionDelivery = "draft"


class CompilerRejectedError(ValueError):
    """Raised when WorkflowIR cannot be compiled into a trusted invoice artifact."""


def _step_by_id(workflow: WorkflowIR, step_id: str):
    for step in workflow.steps:
        if step.id == step_id:
            return step
    return None


def _parse_tolerance(raw: object) -> Decimal:
    try:
        return Decimal(str(raw))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise CompilerRejectedError(
            f"Unsupported amount tolerance value: {raw!r}"
        ) from exc


def _exception_delivery(workflow: WorkflowIR) -> ExceptionDelivery:
    flag = _step_by_id(workflow, "flag_exception")
    if flag is None:
        # Accept AI-inferred workflows that still route mismatches to a draft/review step.
        for step in workflow.steps:
            if step.type in {"draft", "human_review"} and "exception" in step.id.lower():
                flag = step
                break
    if flag is None:
        return "draft"
    delivery = str(flag.configuration.get("delivery", "draft")).strip().lower()
    if delivery not in {"draft", "human_review"}:
        raise CompilerRejectedError(
            f"Unsupported exception delivery configuration: {delivery}"
        )
    return delivery  # type: ignore[return-value]


def _amount_mismatch_action(workflow: WorkflowIR) -> ExceptionAction:
    delivery = _exception_delivery(workflow)
    if delivery == "human_review":
        return "human_review"
    # Prefer decision routing when present.
    for decision in workflow.decisions:
        if "match" in decision.id.lower() or "total" in decision.condition.lower():
            false_step = _step_by_id(workflow, decision.false_step_id)
            if false_step is None:
                raise CompilerRejectedError(
                    f"Decision {decision.id} references unknown false step"
                )
            if false_step.type == "human_review":
                return "human_review"
            if false_step.type in {"draft", "write"}:
                return "exception"
    return "exception"


def _tolerance(workflow: WorkflowIR) -> Decimal:
    compare = _step_by_id(workflow, "compare_totals")
    if compare is None:
        for step in workflow.steps:
            if step.type == "condition" and (
                "total" in step.id.lower() or "amount" in step.id.lower()
            ):
                compare = step
                break
    if compare is None:
        return Decimal("0")
    raw = compare.configuration.get("tolerance", 0)
    tolerance = _parse_tolerance(raw)
    if tolerance < 0:
        raise CompilerRejectedError("Amount tolerance must be non-negative")
    return tolerance


def _parse_bool(raw: object) -> bool:
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        value = raw.strip().lower()
        if value in {"true", "1", "yes"}:
            return True
        if value in {"false", "0", "no"}:
            return False
    raise CompilerRejectedError(f"Unsupported boolean value: {raw!r}")


def _active_steps(workflow: WorkflowIR):
    return [step for step in workflow.steps if not step.accidental]


def _require_step(workflow: WorkflowIR, label: str, predicate) -> None:  # noqa: ANN001
    if not any(predicate(step) for step in _active_steps(workflow)):
        raise CompilerRejectedError(f"Invoice compilation requires {label}")


def validate_invoice_compiler_contract(workflow: WorkflowIR) -> InvoiceCompilerConfig:
    """Validate invoice semantics and return the deterministic compiler config."""
    if workflow.workflow_kind != "invoice_approval":
        raise CompilerRejectedError(
            "Only workflow_kind=invoice_approval can be compiled into an invoice artifact"
        )
    if any(uncertainty.required for uncertainty in workflow.uncertainties):
        raise CompilerRejectedError(
            "Resolve required workflow questions before compiling"
        )

    _validate_graph_basics(workflow)
    _require_step(workflow, "an invoice input step", lambda step: step.type == "input")
    _require_step(workflow, "field extraction", lambda step: step.type == "ai_extract")
    _require_step(workflow, "purchase-order lookup", lambda step: step.type == "lookup")
    _require_step(
        workflow,
        "required-field validation",
        lambda step: step.type == "human_review"
        or any("required" in ref.lower() for ref in [step.id, step.name, step.description]),
    )
    _require_step(
        workflow,
        "amount comparison",
        lambda step: step.type == "condition"
        and any(
            token in f"{step.id} {step.name} {step.description}".lower()
            for token in ("amount", "total")
        ),
    )
    _require_step(workflow, "an approval path", lambda step: step.type == "approval")
    _require_step(workflow, "an exception path", lambda step: step.type in {"draft", "write"})
    _require_step(workflow, "a human-review path", lambda step: step.type == "human_review")

    approval_gates = list(workflow.approvals)
    if not approval_gates:
        raise CompilerRejectedError(
            "Invoice compilation requires an approval gate before high-impact actions"
        )
    active_step_ids = {step.id for step in _active_steps(workflow)}
    for approval in approval_gates:
        step = _step_by_id(workflow, approval.step_id)
        if step is None or step.id not in active_step_ids:
            raise CompilerRejectedError(
                f"Approval {approval.id} references an inactive or missing step"
            )
        if not step.requires_approval and step.type != "approval":
            raise CompilerRejectedError(
                f"Approval {approval.id} must gate a protected approval action"
            )

    compare_currency = True
    for step in workflow.steps:
        if step.type == "condition":
            raw = step.configuration.get("compare_currency")
            if raw is not None:
                compare_currency = _parse_bool(raw)

    return InvoiceCompilerConfig(
        compare_currency=compare_currency,
        amount_tolerance=_tolerance(workflow),
        missing_invoice_number_action="human_review",
        missing_purchase_order_action="human_review",
        purchase_order_not_found_action="human_review",
        amount_mismatch_action=_amount_mismatch_action(workflow),
        matching_action="approval_required",
        exception_delivery=_exception_delivery(workflow),
    )


def _validate_graph_basics(workflow: WorkflowIR) -> None:
    step_ids = {step.id for step in workflow.steps}
    if len(step_ids) != len(workflow.steps):
        raise CompilerRejectedError("Workflow steps must have unique IDs")
    for edge in workflow.edges:
        if edge.source_step_id not in step_ids or edge.target_step_id not in step_ids:
            raise CompilerRejectedError(
                f"Edge {edge.id} references unknown steps "
                f"({edge.source_step_id} → {edge.target_step_id})"
            )
        if edge.source_step_id == edge.target_step_id:
            raise CompilerRejectedError(f"Edge {edge.id} is a self-loop")
    for decision in workflow.decisions:
        for target in (decision.true_step_id, decision.false_step_id):
            if target not in step_ids:
                raise CompilerRejectedError(
                    f"Decision {decision.id} references unknown step {target}"
                )
        if decision.source_step_id and decision.source_step_id not in step_ids:
            raise CompilerRejectedError(
                f"Decision {decision.id} references unknown source step"
            )
    for approval in workflow.approvals:
        if approval.step_id not in step_ids:
            raise CompilerRejectedError(
                f"Approval {approval.id} references unknown step {approval.step_id}"
            )


def extract_invoice_compiler_config(workflow: WorkflowIR) -> InvoiceCompilerConfig:
    """Derive InvoiceCompilerConfig from WorkflowIR or reject unsupported graphs."""
    return validate_invoice_compiler_contract(workflow)


def config_fingerprint(config: InvoiceCompilerConfig) -> str:
    """Stable fingerprint used to prove generated source varies with config."""
    return (
        f"tol={config.amount_tolerance}|"
        f"currency={config.compare_currency}|"
        f"mismatch={config.amount_mismatch_action}|"
        f"delivery={config.exception_delivery}|"
        f"match={config.matching_action}"
    )
