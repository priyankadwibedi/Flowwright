"""Shared compile-readiness evaluation for invoice WorkflowIR."""

from __future__ import annotations

from app.models.workflow import (
    CompileReadinessBlocker,
    CompileReadinessResponse,
    WorkflowIR,
)
from app.services.invoice_compiler import (
    CompilerRejectedError,
    ensure_invoice_review_path,
    validate_invoice_compiler_contract,
)
from app.services.invoice_workflow_normalizer import normalize_invoice_workflow
from app.services.workflow_validation import WorkflowValidationError, validate_workflow_ir


def _blocker(code: str, message: str) -> CompileReadinessBlocker:
    return CompileReadinessBlocker(code=code, message=message)


def evaluate_compile_readiness(workflow: WorkflowIR) -> CompileReadinessResponse:
    """Return structured readiness used by generate/test/invoice routes."""
    warnings: list[str] = []
    kind = workflow.workflow_kind

    if kind != "invoice_approval":
        return CompileReadinessResponse(
            supported=False,
            ready=False,
            workflow_kind=kind,
            blockers=[
                _blocker(
                    "unsupported_workflow_kind",
                    "Only workflow_kind=invoice_approval can be compiled.",
                )
            ],
            warnings=warnings,
        )

    unresolved = [
        item for item in workflow.uncertainties if item.required and not item.resolved
    ]
    blockers: list[CompileReadinessBlocker] = [
        _blocker(
            "unresolved_required_clarification",
            f"Resolve the {item.id} question."
            if item.id
            else "Resolve required clarifications before compiling.",
        )
        for item in unresolved
    ]
    if blockers:
        return CompileReadinessResponse(
            supported=True,
            ready=False,
            workflow_kind=kind,
            blockers=blockers,
            warnings=warnings,
        )

    try:
        migrated = normalize_invoice_workflow(workflow)
        warnings.extend(migrated.warnings)
        shaped = ensure_invoice_review_path(migrated.workflow)
        validate_workflow_ir(shaped)
        validate_invoice_compiler_contract(shaped)
    except CompilerRejectedError as exc:
        message = str(exc)
        code = "compiler_contract_failed"
        lowered = message.lower()
        if "exception path" in lowered or "false path" in lowered:
            code = "missing_exception_path"
        elif "approval" in lowered and "true path" in lowered:
            code = "missing_approval_path"
        elif "human-review" in lowered or "human review" in lowered:
            code = "missing_human_review_path"
        elif "clarification" in lowered or "question" in lowered:
            code = "unresolved_required_clarification"
        return CompileReadinessResponse(
            supported=True,
            ready=False,
            workflow_kind=kind,
            blockers=[_blocker(code, message)],
            warnings=warnings,
        )
    except WorkflowValidationError as exc:
        return CompileReadinessResponse(
            supported=True,
            ready=False,
            workflow_kind=kind,
            blockers=[_blocker("workflow_validation_failed", str(exc))],
            warnings=warnings,
        )
    except ValueError as exc:
        return CompileReadinessResponse(
            supported=True,
            ready=False,
            workflow_kind=kind,
            blockers=[_blocker("compiler_contract_failed", str(exc))],
            warnings=warnings,
        )

    return CompileReadinessResponse(
        supported=True,
        ready=True,
        workflow_kind=kind,
        blockers=[],
        warnings=warnings,
    )


def assert_compile_ready(workflow: WorkflowIR) -> None:
    """Raise CompilerRejectedError when readiness is blocked."""
    result = evaluate_compile_readiness(workflow)
    if result.ready:
        return
    if result.blockers:
        raise CompilerRejectedError(result.blockers[0].message)
    raise CompilerRejectedError("Workflow is not ready to compile")
