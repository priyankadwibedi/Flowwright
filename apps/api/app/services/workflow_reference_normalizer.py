"""Move evidence IDs out of workflow data references before semantic validation."""

from __future__ import annotations

import logging
import re
from collections import defaultdict, deque

from pydantic import BaseModel, ConfigDict, Field

from app.models.workflow import WorkflowIR, WorkflowStep

logger = logging.getLogger(__name__)

EVIDENCE_PREFIXES = (
    "frame-",
    "event-",
    "speech-",
    "screenshot-",
    "transcript-",
    "evidence-",
)

_FRAME_INDEX_RE = re.compile(
    r"^(?:frame|screenshot|img|image)[-_]?(\d+)$",
    re.IGNORECASE,
)


class ReferenceNormalizationWarning(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_id: str
    original_reference: str
    action: str
    message: str


class ReferenceIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_id: str | None = None
    reference: str | None = None
    reference_type: str = "unknown"
    expected_location: str | None = None
    message: str | None = None


class ReferenceNormalizationError(ValueError):
    """Raised when references cannot be normalized without inventing data."""

    def __init__(self, message: str, issues: list[ReferenceIssue]) -> None:
        super().__init__(message)
        self.issues = issues


class ReferenceNormalizationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workflow: WorkflowIR
    warnings: list[ReferenceNormalizationWarning] = Field(default_factory=list)


def _looks_like_evidence(value: str) -> bool:
    lowered = value.lower().strip()
    if any(lowered.startswith(prefix) for prefix in EVIDENCE_PREFIXES):
        return True
    return bool(_FRAME_INDEX_RE.match(lowered.replace("_", "-")))


def resolve_evidence_id(ref: str, evidence_ids: set[str]) -> str | None:
    """Map a model-emitted evidence ref onto a real demonstration evidence ID."""
    if not ref:
        return None
    if ref in evidence_ids:
        return ref

    lowered = ref.strip().lower()
    by_lower = {item.lower(): item for item in evidence_ids}
    if lowered in by_lower:
        return by_lower[lowered]

    normalized = lowered.replace("_", "-")
    if normalized in by_lower:
        return by_lower[normalized]

    match = _FRAME_INDEX_RE.match(normalized)
    if match:
        index = int(match.group(1))
        # Prefer exact numeric suffix matches: frame-3, frame-003, frame-ffmpeg-3.
        candidates = sorted(
            item
            for item in evidence_ids
            if re.search(rf"(?:^|[-_])0*{index}(?:$|[-_])", item.lower())
            and "frame" in item.lower()
        )
        if len(candidates) == 1:
            return candidates[0]
        # Common model habit: copy prompt example frame-128 when only frame-0..N exist.
        if index >= 100 and evidence_ids:
            frames = sorted(
                item for item in evidence_ids if item.lower().startswith("frame-")
            )
            if frames:
                return frames[0]
    return None


def _topo_order(steps: list[WorkflowStep]) -> list[WorkflowStep]:
    by_id = {step.id: step for step in steps}
    indegree: dict[str, int] = {step.id: 0 for step in steps}
    adjacency: dict[str, list[str]] = defaultdict(list)
    for step in steps:
        for dependency in step.depends_on:
            if dependency in by_id:
                adjacency[dependency].append(step.id)
                indegree[step.id] += 1
    queue = deque([step_id for step_id, degree in indegree.items() if degree == 0])
    ordered: list[str] = []
    while queue:
        node = queue.popleft()
        ordered.append(node)
        for child in adjacency.get(node, []):
            indegree[child] -= 1
            if indegree[child] == 0:
                queue.append(child)
    if len(ordered) != len(steps):
        return list(steps)
    return [by_id[step_id] for step_id in ordered]


def normalize_workflow_references(
    workflow: WorkflowIR,
    evidence_ids: set[str],
    *,
    request_id: str | None = None,
) -> ReferenceNormalizationResult:
    """Rewrite misplaced evidence IDs into evidence_ids; reject unresolved refs."""
    input_ids = {item.id for item in workflow.inputs}
    warnings: list[ReferenceNormalizationWarning] = []
    issues: list[ReferenceIssue] = []
    moved_evidence_refs = 0
    unresolved_refs = 0
    fallback_evidence = sorted(evidence_ids)[:1]

    ordered = _topo_order(workflow.steps)
    available_outputs: set[str] = set()
    step_outputs: dict[str, list[str]] = {
        step.id: list(step.output_refs) for step in workflow.steps
    }
    normalized_by_id: dict[str, WorkflowStep] = {}

    for step in ordered:
        input_refs: list[str] = []
        evidence: list[str] = []

        for ref in step.evidence_ids:
            resolved = resolve_evidence_id(ref, evidence_ids)
            if resolved is None:
                if _looks_like_evidence(ref):
                    warnings.append(
                        ReferenceNormalizationWarning(
                            step_id=step.id,
                            original_reference=ref,
                            action="dropped_unknown_evidence",
                            message=(
                                f"Dropped unknown evidence ID {ref}; it was not in "
                                "the processed demonstration"
                            ),
                        )
                    )
                    continue
                issues.append(
                    ReferenceIssue(
                        step_id=step.id,
                        reference=ref,
                        reference_type="evidence",
                        expected_location="processed demonstration evidence_timeline",
                        message=f"Unknown evidence ID {ref}",
                    )
                )
                unresolved_refs += 1
                continue
            if resolved != ref:
                warnings.append(
                    ReferenceNormalizationWarning(
                        step_id=step.id,
                        original_reference=ref,
                        action="remapped_evidence_id",
                        message=f"Remapped evidence ID {ref} to {resolved}",
                    )
                )
            if resolved not in evidence:
                evidence.append(resolved)

        for ref in step.input_refs:
            resolved = resolve_evidence_id(ref, evidence_ids)
            if resolved is not None:
                if resolved not in evidence:
                    evidence.append(resolved)
                warnings.append(
                    ReferenceNormalizationWarning(
                        step_id=step.id,
                        original_reference=ref,
                        action="moved_to_evidence_ids",
                        message=(
                            f"Moved evidence reference {ref} from input_refs "
                            "to evidence_ids"
                        ),
                    )
                )
                moved_evidence_refs += 1
                continue
            if _looks_like_evidence(ref):
                warnings.append(
                    ReferenceNormalizationWarning(
                        step_id=step.id,
                        original_reference=ref,
                        action="dropped_unknown_evidence",
                        message=(
                            f"Dropped evidence-shaped input_ref {ref}; it is not in "
                            "the processed demonstration"
                        ),
                    )
                )
                continue
            if ref in input_ids or ref in available_outputs:
                if ref not in input_refs:
                    input_refs.append(ref)
                continue
            if ref in step_outputs:
                outputs = step_outputs[ref]
                if len(outputs) == 1:
                    mapped = outputs[0]
                    if mapped not in input_refs:
                        input_refs.append(mapped)
                    warnings.append(
                        ReferenceNormalizationWarning(
                            step_id=step.id,
                            original_reference=ref,
                            action="mapped_step_to_output",
                            message=(
                                f"Mapped step id {ref} to its sole output_ref {mapped}"
                            ),
                        )
                    )
                    continue
                issues.append(
                    ReferenceIssue(
                        step_id=step.id,
                        reference=ref,
                        reference_type="step_output",
                        expected_location="input_refs",
                        message=(
                            f"Step id {ref} cannot be used as input_ref without a "
                            "single output_ref"
                        ),
                    )
                )
                unresolved_refs += 1
                continue
            issues.append(
                ReferenceIssue(
                    step_id=step.id,
                    reference=ref,
                    reference_type="unknown",
                    expected_location="input_refs",
                    message=f"Unresolved workflow data reference {ref}",
                )
            )
            unresolved_refs += 1

        depends_on: list[str] = []
        for dependency in step.depends_on:
            resolved = resolve_evidence_id(dependency, evidence_ids)
            if resolved is not None:
                if resolved not in evidence:
                    evidence.append(resolved)
                    warnings.append(
                        ReferenceNormalizationWarning(
                            step_id=step.id,
                            original_reference=dependency,
                            action="moved_to_evidence_ids",
                            message=(
                                f"Moved evidence reference {dependency} from "
                                "depends_on to evidence_ids"
                            ),
                        )
                    )
                    moved_evidence_refs += 1
                continue
            if _looks_like_evidence(dependency):
                warnings.append(
                    ReferenceNormalizationWarning(
                        step_id=step.id,
                        original_reference=dependency,
                        action="dropped_unknown_evidence",
                        message=(
                            f"Dropped evidence-shaped dependency {dependency}; "
                            "it is not in the processed demonstration"
                        ),
                    )
                )
                continue
            depends_on.append(dependency)

        output_refs: list[str] = []
        for ref in step.output_refs:
            resolved = resolve_evidence_id(ref, evidence_ids)
            if resolved is not None or _looks_like_evidence(ref):
                if resolved is not None and resolved not in evidence:
                    evidence.append(resolved)
                warnings.append(
                    ReferenceNormalizationWarning(
                        step_id=step.id,
                        original_reference=ref,
                        action="moved_or_dropped_evidence_output",
                        message=(
                            f"Removed evidence ID {ref} from output_refs"
                            + (
                                f" and kept {resolved} in evidence_ids"
                                if resolved
                                else ""
                            )
                        ),
                    )
                )
                continue
            if ref in input_ids or ref in input_refs:
                warnings.append(
                    ReferenceNormalizationWarning(
                        step_id=step.id,
                        original_reference=ref,
                        action="removed_colliding_output_ref",
                        message=(
                            f"Removed output_ref {ref} because it collides with a "
                            "declared workflow input or this step's input_refs"
                        ),
                    )
                )
                continue
            if ref not in output_refs:
                output_refs.append(ref)

        # AI-backed steps need at least one real evidence ID when evidence exists.
        if (
            (step.requires_ai or step.type == "ai_extract")
            and not evidence
            and fallback_evidence
            and workflow.demonstration_id
        ):
            evidence.extend(fallback_evidence)
            warnings.append(
                ReferenceNormalizationWarning(
                    step_id=step.id,
                    original_reference="",
                    action="attached_fallback_evidence",
                    message=(
                        f"Attached fallback evidence {fallback_evidence[0]} after "
                        "dropping invalid model evidence references"
                    ),
                )
            )

        normalized = step.model_copy(
            update={
                "input_refs": input_refs,
                "output_refs": output_refs,
                "evidence_ids": evidence,
                "depends_on": depends_on,
            }
        )
        normalized_by_id[step.id] = normalized
        step_outputs[step.id] = list(output_refs)
        available_outputs.update(output_refs)

    if issues:
        logger.info(
            "workflow_reference_normalized request_id=%s moved_evidence_refs=%s "
            "unresolved_refs=%s",
            request_id or "-",
            moved_evidence_refs,
            unresolved_refs,
        )
        raise ReferenceNormalizationError(
            "The inferred workflow contained invalid data references.",
            issues,
        )

    normalized_steps = [
        normalized_by_id.get(step.id, step) for step in workflow.steps
    ]
    result = ReferenceNormalizationResult(
        workflow=workflow.model_copy(update={"steps": normalized_steps}),
        warnings=warnings,
    )
    logger.info(
        "workflow_reference_normalized request_id=%s moved_evidence_refs=%s "
        "unresolved_refs=%s warnings=%s",
        request_id or "-",
        moved_evidence_refs,
        unresolved_refs,
        len(warnings),
    )
    return result


def validate_reference_namespaces(
    workflow: WorkflowIR,
    evidence_ids: set[str],
) -> None:
    """Strict post-normalization checks for evidence vs workflow data namespaces."""
    input_ids = {item.id for item in workflow.inputs}
    seen_outputs: set[str] = set()
    produced_by_step: dict[str, str] = {}
    issues: list[ReferenceIssue] = []

    for step in workflow.steps:
        for ref in step.output_refs:
            if ref in produced_by_step and produced_by_step[ref] != step.id:
                issues.append(
                    ReferenceIssue(
                        step_id=step.id,
                        reference=ref,
                        reference_type="step_output",
                        message=f"Duplicate output_ref {ref}",
                    )
                )
            produced_by_step[ref] = step.id

    ordered = _topo_order(workflow.steps)
    available: set[str] = set(input_ids)
    for step in ordered:
        for ref in step.evidence_ids:
            if resolve_evidence_id(ref, evidence_ids) is None:
                issues.append(
                    ReferenceIssue(
                        step_id=step.id,
                        reference=ref,
                        reference_type="evidence",
                        expected_location="evidence_ids",
                        message=f"Unknown evidence ID {ref}",
                    )
                )
        for ref in step.input_refs:
            if (
                resolve_evidence_id(ref, evidence_ids) is not None
                or _looks_like_evidence(ref)
            ):
                issues.append(
                    ReferenceIssue(
                        step_id=step.id,
                        reference=ref,
                        reference_type="evidence",
                        expected_location="evidence_ids",
                        message=(
                            f"Evidence ID {ref} must not appear in input_refs"
                        ),
                    )
                )
                continue
            if ref in step.output_refs:
                issues.append(
                    ReferenceIssue(
                        step_id=step.id,
                        reference=ref,
                        reference_type="step_output",
                        message=f"Step {step.id} cannot consume its own output {ref}",
                    )
                )
                continue
            if ref not in available:
                issues.append(
                    ReferenceIssue(
                        step_id=step.id,
                        reference=ref,
                        reference_type="unknown",
                        expected_location="input_refs",
                        message=(
                            f"Step {step.id} references {ref} before it is produced"
                        ),
                    )
                )
        available.update(step.output_refs)
        seen_outputs.update(step.output_refs)

    if issues:
        raise ReferenceNormalizationError(
            "The inferred workflow contained invalid data references.",
            issues,
        )
