from fastapi import APIRouter, HTTPException, Response, status

from app.core.config import get_settings
from app.models.test_result import TestRunResponse
from app.models.workflow import (
    AnalyzeRequest,
    ExecutableWorkflow,
    InvoiceProcessRequest,
    ResolveRequest,
    ResolveResponse,
    WorkflowIR,
)
from app.services.code_generator import artifact_zip, generate_invoice_artifact
from app.services.demo_analyzer import DemoWorkflowAnalyzer
from app.services.invoice_runtime import process_fixture
from app.services.openai_analyzer import OpenAIWorkflowAnalyzer
from app.services.workflow_tester import run_invoice_tests

router = APIRouter(prefix="/api/v1/workflows", tags=["workflows"])


@router.get("/demo", response_model=WorkflowIR)
def demo_workflow() -> WorkflowIR:
    return DemoWorkflowAnalyzer().analyze("invoice approval")


@router.post("/analyze", response_model=WorkflowIR)
def analyze_workflow(request: AnalyzeRequest) -> WorkflowIR:
    settings = get_settings()
    if settings.flowwright_demo_mode:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "AI analysis is unavailable while FLOWWRIGHT_DEMO_MODE is enabled. "
                "Use the sample invoice demo or disable demo mode with OpenAI configured."
            ),
        )
    try:
        return OpenAIWorkflowAnalyzer(settings).analyze(
            request.task_description,
            transcript=request.transcript,
            browser_event_log=request.browser_event_log,
            screenshots=request.screenshots,
            processed_demonstration=request.processed_demonstration,
        )
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.post("/test", response_model=TestRunResponse)
def test_workflow(workflow: WorkflowIR) -> TestRunResponse:
    if workflow.id != "invoice-approval-demo":
        raise HTTPException(
            status_code=400,
            detail="Only the synthetic invoice workflow is supported in the prototype",
        )
    return run_invoice_tests(workflow)


@router.post("/resolve", response_model=ResolveResponse)
def resolve_workflow(request: ResolveRequest) -> ResolveResponse:
    answer_map = {answer.question_id: answer.answer for answer in request.answers}
    remaining = [
        uncertainty
        for uncertainty in request.workflow.uncertainties
        if uncertainty.id not in answer_map
    ]
    workflow = request.workflow.model_copy(update={"uncertainties": remaining})
    if "exception-delivery" in answer_map:
        steps = []
        for step in workflow.steps:
            if step.id == "flag_exception":
                configuration = {**step.configuration, "delivery": answer_map["exception-delivery"]}
                steps.append(step.model_copy(update={"configuration": configuration}))
            else:
                steps.append(step)
        workflow = workflow.model_copy(update={"steps": steps})
    return ResolveResponse(workflow=workflow, remaining_uncertainties=remaining)


@router.post("/generate", response_model=ExecutableWorkflow)
def generate_workflow(workflow: WorkflowIR) -> ExecutableWorkflow:
    try:
        return generate_invoice_artifact(workflow)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/{workflow_id}/artifact")
def download_workflow_artifact(workflow_id: str) -> Response:
    if workflow_id != "invoice-approval-demo":
        raise HTTPException(
            status_code=404,
            detail="No trusted artifact generator exists for this workflow",
        )
    try:
        artifact = generate_invoice_artifact(DemoWorkflowAnalyzer().analyze("invoice approval"))
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
        result = process_fixture(request.invoice_file)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"invoice_file": request.invoice_file, **result.model_dump(mode="json")}
