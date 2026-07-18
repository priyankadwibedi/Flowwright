from datetime import UTC

from fastapi import APIRouter, HTTPException, Response, status
from openai import APIConnectionError, APIError, APIStatusError, APITimeoutError, RateLimitError

from app.core.config import get_settings
from app.models.test_result import TestRunResponse
from app.models.workflow import (
    AnalyzeRequest,
    CorrectWorkflowRequest,
    ExecutableWorkflow,
    InvoiceApprovalRequest,
    InvoiceApprovalResponse,
    InvoiceProcessRequest,
    ResolveRequest,
    ResolveResponse,
    WorkflowApproval,
    WorkflowIR,
)
from app.services.clarifications import ClarificationError, apply_clarifications
from app.services.code_generator import artifact_zip, generate_invoice_artifact
from app.services.demo_analyzer import DemoWorkflowAnalyzer
from app.services.invoice_compiler import CompilerRejectedError, extract_invoice_compiler_config
from app.services.invoice_runtime import approve_fixture, process_fixture
from app.services.openai_analyzer import OpenAIWorkflowAnalyzer
from app.services.workflow_tester import run_invoice_tests
from app.services.workflow_validation import WorkflowValidationError, validate_workflow_ir

router = APIRouter(prefix="/api/v1/workflows", tags=["workflows"])


def _ensure_invoice_kind(workflow: WorkflowIR) -> None:
    if workflow.workflow_kind != "invoice_approval":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "This workflow is marked unsupported for compilation. "
                "Only workflow_kind=invoice_approval can generate code, run tests, "
                "or drive the invoice mini-application."
            ),
        )


@router.get("/demo", response_model=WorkflowIR)
def demo_workflow() -> WorkflowIR:
    return DemoWorkflowAnalyzer().analyze("invoice approval")


@router.post("/analyze", response_model=WorkflowIR)
def analyze_workflow(request: AnalyzeRequest) -> WorkflowIR:
    settings = get_settings()
    if settings.effective_demo_mode:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "AI analysis is unavailable on this deployment. Configure the backend "
                "with OpenAI credentials and set FLOWWRIGHT_DEMO_MODE=false, or use "
                "the sample invoice workflow."
            ),
        )
    try:
        workflow = OpenAIWorkflowAnalyzer(settings).analyze(
            request.task_description,
            transcript=request.transcript,
            browser_event_log=request.browser_event_log,
            screenshots=request.screenshots,
            processed_demonstration=request.processed_demonstration,
        )
        validate_workflow_ir(workflow)
        return workflow
    except RateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="AI provider rate limit exceeded",
        ) from exc
    except APITimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="AI provider request timed out",
        ) from exc
    except (APIConnectionError, APIError, APIStatusError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider request failed",
        ) from exc
    except (RuntimeError, ValueError, WorkflowValidationError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.post("/test", response_model=TestRunResponse)
def test_workflow(workflow: WorkflowIR) -> TestRunResponse:
    _ensure_invoice_kind(workflow)
    try:
        validate_workflow_ir(workflow)
        return run_invoice_tests(workflow)
    except (ValueError, CompilerRejectedError, WorkflowValidationError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.post("/resolve", response_model=ResolveResponse)
def resolve_workflow(request: ResolveRequest) -> ResolveResponse:
    try:
        return apply_clarifications(request.workflow, request.answers)
    except ClarificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.post("/correct", response_model=WorkflowIR)
def correct_workflow(request: CorrectWorkflowRequest) -> WorkflowIR:
    workflow = request.workflow
    steps = list(workflow.steps)
    variables = list(workflow.variables)
    approvals = list(workflow.approvals)
    step_ids = {step.id for step in steps}
    variable_ids = {variable.id for variable in variables}
    for correction in request.corrections:
        if correction.step_id not in step_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown correction step_id: {correction.step_id}",
            )
        if (
            correction.accidental is None
            and correction.rename is None
            and correction.mark_constant is None
            and not correction.require_human_approval
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Correction must include a supported change",
            )
        if correction.rename is not None and not correction.rename.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Correction rename cannot be blank",
            )
        if correction.variable_id is not None and correction.variable_id not in variable_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown correction variable_id: {correction.variable_id}",
            )
        if correction.mark_constant is not None and correction.variable_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="mark_constant requires variable_id",
            )
        steps = [
            (
                step.model_copy(
                    update={
                        **(
                            {"accidental": correction.accidental}
                            if correction.accidental is not None
                            else {}
                        ),
                        **({"name": correction.rename.strip()} if correction.rename else {}),
                        **(
                            {"requires_approval": True}
                            if correction.require_human_approval
                            else {}
                        ),
                    }
                )
                if step.id == correction.step_id
                else step
            )
            for step in steps
        ]
        if correction.variable_id is not None and correction.mark_constant is not None:
            variables = [
                (
                    variable.model_copy(update={"constant": correction.mark_constant})
                    if variable.id == correction.variable_id
                    else variable
                )
                for variable in variables
            ]
        if correction.require_human_approval and not any(
            approval.step_id == correction.step_id for approval in approvals
        ):
            approvals.append(
                WorkflowApproval(
                    id=f"approval-{correction.step_id}",
                    name=f"Approval for {correction.step_id}",
                    description="Human approval required after correction.",
                    trigger="manual_correction",
                    step_id=correction.step_id,
                )
            )
    updated = workflow.model_copy(
        update={"steps": steps, "variables": variables, "approvals": approvals}
    )
    try:
        validate_workflow_ir(updated)
    except WorkflowValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if updated.workflow_kind == "invoice_approval":
        try:
            extract_invoice_compiler_config(updated)
        except CompilerRejectedError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    return updated


@router.post("/generate", response_model=ExecutableWorkflow)
def generate_workflow(workflow: WorkflowIR) -> ExecutableWorkflow:
    _ensure_invoice_kind(workflow)
    try:
        validate_workflow_ir(workflow)
        return generate_invoice_artifact(workflow)
    except (ValueError, CompilerRejectedError, WorkflowValidationError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.post("/artifact")
def create_workflow_artifact(workflow: WorkflowIR) -> Response:
    _ensure_invoice_kind(workflow)
    try:
        validate_workflow_ir(workflow)
        artifact = generate_invoice_artifact(workflow)
    except (ValueError, CompilerRejectedError, WorkflowValidationError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    filename = f"flowwright-{workflow.id}-workflow.zip"
    return Response(
        content=artifact_zip(artifact),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{workflow_id}/artifact")
def download_workflow_artifact(workflow_id: str) -> Response:
    demo = DemoWorkflowAnalyzer().analyze("invoice approval")
    if workflow_id != demo.id:
        raise HTTPException(
            status_code=404,
            detail="No trusted artifact generator exists for this workflow id",
        )
    try:
        artifact = generate_invoice_artifact(demo)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(
        content=artifact_zip(artifact),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="flowwright-invoice-workflow.zip"'},
    )


invoices_router = APIRouter(prefix="/api/v1/invoices", tags=["invoices"])


@invoices_router.post("/process")
def process_invoice(request: InvoiceProcessRequest) -> dict[str, object]:
    try:
        if request.workflow is not None:
            _ensure_invoice_kind(request.workflow)
        result = process_fixture(request.invoice_file, request.workflow)
    except (ValueError, CompilerRejectedError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"invoice_file": request.invoice_file, **result.model_dump(mode="json")}


@invoices_router.post("/approve", response_model=InvoiceApprovalResponse)
def approve_invoice(request: InvoiceApprovalRequest) -> InvoiceApprovalResponse:
    if not request.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explicit confirmation is required before recording approval",
        )
    try:
        _ensure_invoice_kind(request.workflow)
        artifact = generate_invoice_artifact(request.workflow)
        if request.compiled_workflow_id != artifact.workflow_id:
            raise ValueError("Approval workflow identity does not match compiled workflow")
        if request.compiler_hash != (artifact.compiler_fingerprint or ""):
            raise ValueError("Approval compiler hash does not match compiled workflow")
        record_id = approve_fixture(request.invoice_file, request.workflow)
    except (ValueError, CompilerRejectedError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return InvoiceApprovalResponse(
        invoice_file=request.invoice_file,
        status="approved",
        message=(
            "Synthetic approval receipt created. "
            "No persistent approval store or external action was used."
        ),
        approval_record_id=record_id,
        compiled_workflow_id=request.compiled_workflow_id,
        compiler_hash=request.compiler_hash,
        decision=request.decision,
        timestamp=request.timestamp.astimezone(UTC)
        if request.timestamp.tzinfo
        else request.timestamp.replace(tzinfo=UTC),
    )
