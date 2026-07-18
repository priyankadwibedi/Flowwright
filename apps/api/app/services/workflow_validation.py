import logging
from collections import defaultdict, deque

from app.models.workflow import WorkflowIR
from app.services.workflow_reference_normalizer import EVIDENCE_PREFIXES

logger = logging.getLogger(__name__)


def _looks_like_evidence(value: str) -> bool:
    lowered = value.lower()
    return any(lowered.startswith(prefix) for prefix in EVIDENCE_PREFIXES)


class WorkflowValidationError(ValueError):
    """Raised when a WorkflowIR graph violates semantic constraints."""


def _unique(ids: list[str], label: str) -> None:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for item in ids:
        if item in seen:
            duplicates.add(item)
        seen.add(item)
    if duplicates:
        raise WorkflowValidationError(f"Duplicate {label} IDs: {sorted(duplicates)}")


def _has_cycle(step_ids: set[str], edges: list[tuple[str, str]]) -> bool:
    adjacency: dict[str, list[str]] = defaultdict(list)
    indegree: dict[str, int] = {step_id: 0 for step_id in step_ids}
    for source, target in edges:
        adjacency[source].append(target)
        indegree[target] = indegree.get(target, 0) + 1
        indegree.setdefault(source, indegree.get(source, 0))
    queue = deque([node for node, degree in indegree.items() if degree == 0])
    seen = 0
    while queue:
        node = queue.popleft()
        seen += 1
        for child in adjacency.get(node, []):
            indegree[child] -= 1
            if indegree[child] == 0:
                queue.append(child)
    return seen < len(indegree)


def validate_workflow_ir(workflow: WorkflowIR) -> None:
    """Validate uniqueness, references, cycles, reachability, and compiler readiness."""
    _unique([item.id for item in workflow.inputs], "input")
    _unique([item.id for item in workflow.variables], "variable")
    _unique([item.id for item in workflow.steps], "step")
    _unique([item.id for item in workflow.decisions], "decision")
    _unique([item.id for item in workflow.edges], "edge")
    _unique([item.id for item in workflow.approvals], "approval")
    _unique([item.id for item in workflow.uncertainties], "uncertainty")

    step_ids = {step.id for step in workflow.steps}
    input_ids = {item.id for item in workflow.inputs}
    variable_ids = {item.id for item in workflow.variables}
    produced_refs = {
        ref for step in workflow.steps for ref in step.output_refs
    }
    known_refs = input_ids | variable_ids | step_ids | produced_refs
    input_step_ids = {step.id for step in workflow.steps if step.type == "input"}
    require_ai_evidence = bool(workflow.demonstration_id)
    active_steps = {step.id for step in workflow.steps if not step.accidental}

    for step in workflow.steps:
        for dependency in step.depends_on:
            if dependency not in step_ids:
                raise WorkflowValidationError(
                    f"Step {step.id} depends on unknown step {dependency}"
                )
            if dependency == step.id:
                raise WorkflowValidationError(f"Step {step.id} cannot depend on itself")
        for ref in step.input_refs:
            if _looks_like_evidence(ref):
                raise WorkflowValidationError(
                    f"Step {step.id} must not use evidence ID {ref} as input_ref"
                )
            if ref not in known_refs:
                raise WorkflowValidationError(
                    f"Step {step.id} references unknown input {ref}"
                )
        if require_ai_evidence and step.requires_ai and not step.evidence_ids:
            raise WorkflowValidationError(
                f"AI step {step.id} requires at least one evidence reference"
            )
        if step.requires_approval and not any(
            approval.step_id == step.id for approval in workflow.approvals
        ):
            raise WorkflowValidationError(
                f"Approval step {step.id} requires a matching approval gate"
            )

    for edge in workflow.edges:
        if edge.source_step_id not in step_ids or edge.target_step_id not in step_ids:
            raise WorkflowValidationError(
                f"Edge {edge.id} references unknown steps"
            )
        if edge.source_step_id == edge.target_step_id:
            raise WorkflowValidationError(f"Edge {edge.id} is a self-dependency")

    for decision in workflow.decisions:
        targets = {
            decision.true_step_id,
            decision.false_step_id,
            *([decision.source_step_id] if decision.source_step_id else []),
        }
        if not targets <= step_ids:
            raise WorkflowValidationError(
                f"Decision {decision.id} references unknown steps"
            )
        if decision.source_step_id:
            true_edges = [
                edge
                for edge in workflow.edges
                if edge.source_step_id == decision.source_step_id and edge.kind == "true"
            ]
            false_edges = [
                edge
                for edge in workflow.edges
                if edge.source_step_id == decision.source_step_id and edge.kind == "false"
            ]
            if true_edges and any(
                edge.target_step_id != decision.true_step_id for edge in true_edges
            ):
                raise WorkflowValidationError(
                    f"Decision {decision.id} true target is inconsistent with true edges"
                )
            if false_edges and any(
                edge.target_step_id != decision.false_step_id for edge in false_edges
            ):
                raise WorkflowValidationError(
                    f"Decision {decision.id} false target is inconsistent with false edges"
                )

    for approval in workflow.approvals:
        if approval.step_id not in step_ids:
            raise WorkflowValidationError(
                f"Approval {approval.id} references unknown step {approval.step_id}"
            )

    for uncertainty in workflow.uncertainties:
        for step_id in uncertainty.affected_step_ids:
            if step_id not in step_ids:
                raise WorkflowValidationError(
                    f"Uncertainty {uncertainty.id} references unknown step {step_id}"
                )

    dependency_edges = [
        (dependency, step.id)
        for step in workflow.steps
        for dependency in step.depends_on
    ] + [(edge.source_step_id, edge.target_step_id) for edge in workflow.edges]

    if _has_cycle(step_ids, dependency_edges):
        raise WorkflowValidationError("Workflow graph contains a cycle")

    if not input_step_ids:
        raise WorkflowValidationError("Workflow must include at least one input step")

    adjacency: dict[str, list[str]] = defaultdict(list)
    for source, target in dependency_edges:
        adjacency[source].append(target)
    reachable: set[str] = set()
    queue = deque(input_step_ids)
    while queue:
        node = queue.popleft()
        if node in reachable:
            continue
        reachable.add(node)
        queue.extend(adjacency.get(node, []))
    if not reachable:
        raise WorkflowValidationError("No steps are reachable from an input step")

    unreachable_active = sorted(active_steps - reachable)
    if unreachable_active:
        raise WorkflowValidationError(
            "Unreachable non-accidental steps: " + ", ".join(unreachable_active)
        )

    terminal = {
        step.id
        for step in workflow.steps
        if step.id in reachable and not adjacency.get(step.id)
    }
    if not terminal:
        terminal = {
            step.id
            for step in workflow.steps
            if step.type in {"approval", "human_review", "draft"} and step.id in reachable
        }
    if not terminal:
        raise WorkflowValidationError("Workflow has no terminal path")

    if workflow.workflow_kind not in {"invoice_approval", "unsupported"}:
        raise WorkflowValidationError("Invalid workflow_kind")
