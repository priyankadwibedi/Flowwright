"""Normalize WorkflowIR into a deterministic invoice compiler configuration."""

from decimal import Decimal, InvalidOperation
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.workflow import (
    InvoiceStepRole,
    WorkflowApproval,
    WorkflowEdge,
    WorkflowIR,
    WorkflowStep,
)
from app.services.invoice_workflow_normalizer import (
    has_route_to_role,
    normalize_invoice_workflow,
    steps_with_role,
)

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


def ensure_invoice_review_path(workflow: WorkflowIR) -> WorkflowIR:
    """Ensure AI-inferred invoice graphs include the mandatory human-review path.

    Demonstrations often show only match → approval and mismatch → exception.
    The invoice compiler also requires a human-review terminal for missing or
    unreadable required fields. Synthesize that path when absent.
    """
    if workflow.workflow_kind != "invoice_approval":
        return workflow
    migrated = normalize_invoice_workflow(workflow).workflow
    active = [step for step in migrated.steps if not step.accidental]
    if any(
        step.semantic_role == InvoiceStepRole.HUMAN_REVIEW or step.type == "human_review"
        for step in active
    ):
        return migrated

    parent = next(
        (
            step
            for step in active
            if step.semantic_role == InvoiceStepRole.COMPARE_AMOUNTS
            or step.type == "condition"
        ),
        None,
    )
    if parent is None:
        parent = next(
            (
                step
                for step in active
                if step.semantic_role == InvoiceStepRole.LOOKUP_PURCHASE_ORDER
                or step.type == "lookup"
            ),
            None,
        )
    if parent is None:
        parent = next(
            (
                step
                for step in active
                if step.semantic_role == InvoiceStepRole.EXTRACT_FIELDS
                or step.type == "ai_extract"
            ),
            None,
        )
    if parent is None:
        parent = active[0] if active else None
    if parent is None:
        raise CompilerRejectedError(
            "Invoice compilation requires an invoice input step before human review"
        )

    review_id = "human_review"
    used_ids = {step.id for step in migrated.steps}
    if review_id in used_ids:
        review_id = "required_fields_human_review"

    review = WorkflowStep(
        id=review_id,
        name="Human review",
        type="human_review",
        description=(
            "Request review when required information is missing, unreadable, "
            "or uncertain."
        ),
        depends_on=[parent.id],
        input_refs=list(parent.output_refs) or list(parent.input_refs),
        output_refs=["review_record"],
        configuration={"reason": "required_fields_missing_or_unreadable"},
        requires_ai=False,
        requires_approval=True,
        confidence=min(parent.confidence, 0.85),
        evidence_ids=list(parent.evidence_ids),
        accidental=False,
        semantic_role=InvoiceStepRole.HUMAN_REVIEW,
    )
    edge = WorkflowEdge(
        id=f"{parent.id}-{review_id}-review",
        source_step_id=parent.id,
        target_step_id=review_id,
        kind="review",
        condition="required fields missing or unreadable",
        label="review",
    )
    gate = WorkflowApproval(
        id=f"{review_id}-gate",
        name="Human review gate",
        description="Explicit review when required invoice fields are incomplete.",
        trigger="required_fields_missing_or_unreadable",
        step_id=review_id,
        evidence_ids=list(parent.evidence_ids),
    )
    return migrated.model_copy(
        update={
            "steps": [*migrated.steps, review],
            "edges": [*migrated.edges, edge],
            "approvals": [*migrated.approvals, gate],
        }
    )


def _step_by_id(workflow: WorkflowIR, step_id: str) -> WorkflowStep | None:
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
    flags = steps_with_role(workflow, InvoiceStepRole.EXCEPTION)
    flag = flags[0] if flags else None
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
    compares = steps_with_role(workflow, InvoiceStepRole.COMPARE_AMOUNTS)
    for compare in compares:
        if has_route_to_role(
            workflow,
            compare.id,
            InvoiceStepRole.HUMAN_REVIEW,
            kinds={"false", "failure"},
        ):
            return "human_review"
        if has_route_to_role(
            workflow,
            compare.id,
            InvoiceStepRole.EXCEPTION,
            kinds={"false", "failure"},
        ):
            return "exception"
    for decision in workflow.decisions:
        false_step = _step_by_id(workflow, decision.false_step_id)
        if false_step is None:
            raise CompilerRejectedError(
                f"Decision {decision.id} references unknown false step"
            )
        if false_step.semantic_role == InvoiceStepRole.HUMAN_REVIEW:
            return "human_review"
        if false_step.semantic_role == InvoiceStepRole.EXCEPTION:
            return "exception"
        if false_step.type == "human_review":
            return "human_review"
        if false_step.type in {"draft", "write", "transform"}:
            return "exception"
    return "exception"


def _tolerance(workflow: WorkflowIR) -> Decimal:
    compares = steps_with_role(workflow, InvoiceStepRole.COMPARE_AMOUNTS)
    compare = compares[0] if compares else None
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


def _active_steps(workflow: WorkflowIR) -> list[WorkflowStep]:
    return [step for step in workflow.steps if not step.accidental]


def _require_unique_role(workflow: WorkflowIR, role: InvoiceStepRole, label: str) -> WorkflowStep:
    matches = steps_with_role(workflow, role)
    if not matches:
        raise CompilerRejectedError(f"Invoice compilation requires {label}")
    if len(matches) > 1:
        raise CompilerRejectedError(
            f"Invoice compilation requires exactly one {label} "
            f"(found {len(matches)})"
        )
    return matches[0]


def _reachable_ids(workflow: WorkflowIR) -> set[str]:
    inputs = [
        step.id
        for step in _active_steps(workflow)
        if step.semantic_role == InvoiceStepRole.INVOICE_INPUT or step.type == "input"
    ]
    if not inputs:
        return set()
    adjacency: dict[str, set[str]] = {step.id: set() for step in workflow.steps}
    for edge in workflow.edges:
        adjacency.setdefault(edge.source_step_id, set()).add(edge.target_step_id)
    for decision in workflow.decisions:
        source = decision.source_step_id
        if source:
            adjacency.setdefault(source, set()).update(
                {decision.true_step_id, decision.false_step_id}
            )
    for step in workflow.steps:
        for dependency in step.depends_on:
            adjacency.setdefault(dependency, set()).add(step.id)

    seen: set[str] = set()
    stack = list(inputs)
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        stack.extend(adjacency.get(current, ()))
    return seen


def validate_invoice_compiler_contract(workflow: WorkflowIR) -> InvoiceCompilerConfig:
    """Validate invoice semantics and return the deterministic compiler config."""
    if workflow.workflow_kind != "invoice_approval":
        raise CompilerRejectedError(
            "Only workflow_kind=invoice_approval can be compiled into an invoice artifact"
        )
    unresolved = [
        uncertainty
        for uncertainty in workflow.uncertainties
        if uncertainty.required and not uncertainty.resolved
    ]
    if unresolved:
        raise CompilerRejectedError(
            "Resolve required workflow questions before compiling"
        )

    workflow = ensure_invoice_review_path(workflow)
    workflow = normalize_invoice_workflow(workflow).workflow
    _validate_graph_basics(workflow)

    input_step = _require_unique_role(
        workflow, InvoiceStepRole.INVOICE_INPUT, "an invoice input step"
    )
    _require_unique_role(
        workflow, InvoiceStepRole.EXTRACT_FIELDS, "field extraction"
    )
    _require_unique_role(
        workflow, InvoiceStepRole.LOOKUP_PURCHASE_ORDER, "purchase-order lookup"
    )
    compare = _require_unique_role(
        workflow, InvoiceStepRole.COMPARE_AMOUNTS, "amount comparison"
    )
    approval = _require_unique_role(
        workflow, InvoiceStepRole.APPROVAL, "an approval path"
    )
    exception = _require_unique_role(
        workflow, InvoiceStepRole.EXCEPTION, "an exception path"
    )
    review = _require_unique_role(
        workflow, InvoiceStepRole.HUMAN_REVIEW, "a human-review path"
    )

    # Exception role may use draft / human_review / transform UI types.
    if exception.type not in {"draft", "write", "transform", "human_review"}:
        raise CompilerRejectedError(
            "Invoice compilation requires an exception path with a draft, "
            "write, transform, or human_review step type"
        )

    if not has_route_to_role(
        workflow,
        compare.id,
        InvoiceStepRole.APPROVAL,
        kinds={"true", "approval", "success"},
    ):
        raise CompilerRejectedError(
            "Invoice compilation requires a true path from amount comparison to approval"
        )
    if not has_route_to_role(
        workflow,
        compare.id,
        InvoiceStepRole.EXCEPTION,
        kinds={"false", "failure"},
    ):
        raise CompilerRejectedError(
            "Invoice compilation requires a false path from amount comparison to exception"
        )

    review_reachable = has_route_to_role(
        workflow,
        compare.id,
        InvoiceStepRole.HUMAN_REVIEW,
        kinds={"review"},
    ) or any(
        edge.target_step_id == review.id and edge.kind == "review"
        for edge in workflow.edges
    ) or any(
        step.semantic_role
        in {
            InvoiceStepRole.EXTRACT_FIELDS,
            InvoiceStepRole.LOOKUP_PURCHASE_ORDER,
            InvoiceStepRole.COMPARE_AMOUNTS,
            InvoiceStepRole.VALIDATE_REQUIRED_FIELDS,
        }
        and has_route_to_role(
            workflow,
            step.id,
            InvoiceStepRole.HUMAN_REVIEW,
            kinds={"review", "false", "failure"},
        )
        for step in _active_steps(workflow)
    )
    if not review_reachable:
        raise CompilerRejectedError(
            "Invoice compilation requires a review or missing-data path to human review"
        )

    approval_gates = list(workflow.approvals)
    if not approval_gates:
        raise CompilerRejectedError(
            "Invoice compilation requires an approval gate before high-impact actions"
        )
    active_step_ids = {step.id for step in _active_steps(workflow)}
    gated_approval = False
    for approval_gate in approval_gates:
        step = _step_by_id(workflow, approval_gate.step_id)
        if step is None or step.id not in active_step_ids:
            raise CompilerRejectedError(
                f"Approval {approval_gate.id} references an inactive or missing step"
            )
        if not step.requires_approval and step.type != "approval" and (
            step.semantic_role
            not in {InvoiceStepRole.APPROVAL, InvoiceStepRole.HUMAN_REVIEW}
        ):
            raise CompilerRejectedError(
                f"Approval {approval_gate.id} must gate a protected approval action"
            )
        if step.id == approval.id or step.semantic_role == InvoiceStepRole.APPROVAL:
            gated_approval = True
    if not gated_approval:
        raise CompilerRejectedError(
            "Invoice compilation requires an approval gate attached to the approval step"
        )

    reachable = _reachable_ids(workflow)
    for required in (input_step, compare, approval, exception, review):
        if required.id not in reachable:
            raise CompilerRejectedError(
                f"Invoice compilation requires reachable role step {required.id}"
            )

    compare_currency = True
    for step in steps_with_role(workflow, InvoiceStepRole.COMPARE_AMOUNTS):
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
    """SHA-256 of canonical InvoiceCompilerConfig JSON (stable across processes)."""
    import hashlib
    import json

    payload = json.dumps(config.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
