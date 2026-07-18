"""Deterministic semantic-role migration and invoice graph normalization."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.models.workflow import (
    InvoiceStepRole,
    WorkflowEdge,
    WorkflowIR,
    WorkflowStep,
)

LEGACY_ROLE_BY_ID: dict[str, InvoiceStepRole] = {
    "invoice_upload": InvoiceStepRole.INVOICE_INPUT,
    "extract_fields": InvoiceStepRole.EXTRACT_FIELDS,
    "lookup_po": InvoiceStepRole.LOOKUP_PURCHASE_ORDER,
    "compare_totals": InvoiceStepRole.COMPARE_AMOUNTS,
    "approve_invoice": InvoiceStepRole.APPROVAL,
    "flag_exception": InvoiceStepRole.EXCEPTION,
    "human_review": InvoiceStepRole.HUMAN_REVIEW,
    "required_fields_human_review": InvoiceStepRole.HUMAN_REVIEW,
}

_NAME_ROLE_PATTERNS: list[tuple[re.Pattern[str], InvoiceStepRole]] = [
    (
        re.compile(
            r"^(upload|receive|ingest).*(invoice)?$|invoice.*(upload|input)$",
            re.I,
        ),
        InvoiceStepRole.INVOICE_INPUT,
    ),
    (
        re.compile(r"extract.*(invoice|field)|ai field extraction", re.I),
        InvoiceStepRole.EXTRACT_FIELDS,
    ),
    (
        re.compile(
            r"lookup.*(purchase.?order|po)|purchase.?order lookup",
            re.I,
        ),
        InvoiceStepRole.LOOKUP_PURCHASE_ORDER,
    ),
    (
        re.compile(r"compare.*(amount|total)|total comparison", re.I),
        InvoiceStepRole.COMPARE_AMOUNTS,
    ),
    (
        re.compile(r"^(prepare for )?approval|approval path$", re.I),
        InvoiceStepRole.APPROVAL,
    ),
    (
        re.compile(r"flag.*exception|exception path", re.I),
        InvoiceStepRole.EXCEPTION,
    ),
    (
        re.compile(r"human.?review|review path", re.I),
        InvoiceStepRole.HUMAN_REVIEW,
    ),
]


@dataclass
class NormalizationResult:
    workflow: WorkflowIR
    warnings: list[str] = field(default_factory=list)


def _normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _role_from_type(step: WorkflowStep) -> InvoiceStepRole | None:
    if step.type == "input":
        return InvoiceStepRole.INVOICE_INPUT
    if step.type == "ai_extract":
        return InvoiceStepRole.EXTRACT_FIELDS
    if step.type == "lookup":
        return InvoiceStepRole.LOOKUP_PURCHASE_ORDER
    if step.type == "approval":
        return InvoiceStepRole.APPROVAL
    if step.type == "human_review":
        return InvoiceStepRole.HUMAN_REVIEW
    if step.type == "condition":
        blob = f"{step.id} {step.name} {step.description}".lower()
        if any(token in blob for token in ("amount", "total")):
            return InvoiceStepRole.COMPARE_AMOUNTS
    return None


def _role_from_edges(
    step: WorkflowStep,
    workflow: WorkflowIR,
    assigned: dict[str, InvoiceStepRole],
) -> InvoiceStepRole | None:
    """Infer exception/approval/human_review from comparison outgoing edges."""
    compare_ids = {
        step_id
        for step_id, role in assigned.items()
        if role == InvoiceStepRole.COMPARE_AMOUNTS
    }
    for edge in workflow.edges:
        if edge.source_step_id not in compare_ids:
            continue
        if edge.target_step_id != step.id:
            continue
        if edge.kind in {"false", "failure"}:
            return InvoiceStepRole.EXCEPTION
        if edge.kind in {"true", "approval", "success"}:
            # Prefer approval when the target is approval-typed or named for approval.
            if step.type == "approval" or "approv" in _normalize_name(step.name):
                return InvoiceStepRole.APPROVAL
            if step.type in {"draft", "write", "transform"} and "exception" in _normalize_name(
                step.name
            ):
                continue
            if step.type == "approval" or step.requires_approval:
                return InvoiceStepRole.APPROVAL
        if edge.kind == "review":
            return InvoiceStepRole.HUMAN_REVIEW

    for decision in workflow.decisions:
        source = decision.source_step_id
        if source and assigned.get(source) != InvoiceStepRole.COMPARE_AMOUNTS:
            # Also accept amount/total decisions without assigned compare yet.
            condition = decision.condition.lower()
            if (
                not any(token in condition for token in ("amount", "total", "match"))
                and source not in compare_ids
            ):
                continue
        elif source is None:
            condition = decision.condition.lower()
            if not any(token in condition for token in ("amount", "total", "match")):
                continue
        if decision.false_step_id == step.id:
            return InvoiceStepRole.EXCEPTION
        if decision.true_step_id == step.id and (
            step.type == "approval" or "approv" in _normalize_name(step.name)
        ):
            return InvoiceStepRole.APPROVAL
    return None


def _role_from_legacy_id(step: WorkflowStep) -> InvoiceStepRole | None:
    return LEGACY_ROLE_BY_ID.get(step.id)


def _role_from_name(step: WorkflowStep) -> InvoiceStepRole | None:
    name = _normalize_name(step.name)
    for pattern, role in _NAME_ROLE_PATTERNS:
        if pattern.search(name) or pattern.search(step.name):
            return role
    return None


def infer_semantic_role(
    step: WorkflowStep,
    workflow: WorkflowIR,
    assigned: dict[str, InvoiceStepRole],
    warnings: list[str],
) -> InvoiceStepRole | None:
    """Migrate a step role using the deterministic priority order."""
    if step.semantic_role is not None:
        return step.semantic_role

    for inferrer, label in (
        (lambda s: _role_from_type(s), "step type"),
        (lambda s: _role_from_edges(s, workflow, assigned), "edge relationship"),
        (lambda s: _role_from_legacy_id(s), "legacy fixture id"),
        (lambda s: _role_from_name(s), "normalized name"),
    ):
        role = inferrer(step)
        if role is not None:
            warnings.append(
                f"Migrated step {step.id!r} to semantic_role={role.value} via {label}"
            )
            return role
    return None


def migrate_semantic_roles(workflow: WorkflowIR) -> NormalizationResult:
    """Assign missing semantic roles without silently inventing invoice structure."""
    if workflow.workflow_kind != "invoice_approval":
        return NormalizationResult(workflow=workflow)

    warnings: list[str] = []
    assigned: dict[str, InvoiceStepRole] = {
        step.id: step.semantic_role
        for step in workflow.steps
        if step.semantic_role is not None and not step.accidental
    }

    # Multi-pass so edge inference can use newly assigned comparison roles.
    steps = list(workflow.steps)
    for _ in range(3):
        changed = False
        next_steps: list[WorkflowStep] = []
        for step in steps:
            if step.accidental:
                next_steps.append(step)
                continue
            if step.semantic_role is not None:
                assigned[step.id] = step.semantic_role
                next_steps.append(step)
                continue
            role = infer_semantic_role(step, workflow, assigned, warnings)
            if role is not None:
                assigned[step.id] = role
                next_steps.append(step.model_copy(update={"semantic_role": role}))
                changed = True
            else:
                next_steps.append(step)
        steps = next_steps
        if not changed:
            break

    return NormalizationResult(
        workflow=workflow.model_copy(update={"steps": steps}),
        warnings=warnings,
    )


def active_steps(workflow: WorkflowIR) -> list[WorkflowStep]:
    return [step for step in workflow.steps if not step.accidental]


def steps_with_role(
    workflow: WorkflowIR, role: InvoiceStepRole
) -> list[WorkflowStep]:
    return [step for step in active_steps(workflow) if step.semantic_role == role]


def find_outgoing(
    workflow: WorkflowIR,
    source_id: str,
    *,
    kinds: set[str] | None = None,
) -> list[WorkflowEdge]:
    edges = [
        edge for edge in workflow.edges if edge.source_step_id == source_id
    ]
    if kinds is not None:
        edges = [edge for edge in edges if edge.kind in kinds]
    return edges


def has_route_to_role(
    workflow: WorkflowIR,
    source_id: str,
    target_role: InvoiceStepRole,
    *,
    kinds: set[str],
) -> bool:
    role_ids = {step.id for step in steps_with_role(workflow, target_role)}
    for edge in find_outgoing(workflow, source_id, kinds=kinds):
        if edge.target_step_id in role_ids:
            return True
    for decision in workflow.decisions:
        # Only count decisions that are explicitly rooted at this source step.
        if decision.source_step_id != source_id:
            continue
        if "true" in kinds and decision.true_step_id in role_ids:
            return True
        if "false" in kinds and decision.false_step_id in role_ids:
            return True
        if "approval" in kinds and decision.true_step_id in role_ids:
            return True
        if "failure" in kinds and decision.false_step_id in role_ids:
            return True
    return False


def normalize_invoice_workflow(workflow: WorkflowIR) -> NormalizationResult:
    """Migrate roles for invoice workflows prior to compiler validation."""
    return migrate_semantic_roles(workflow)
