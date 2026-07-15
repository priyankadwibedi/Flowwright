from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.models.test_result import TestRunResponse
from app.models.workflow import AnalyzeRequest, WorkflowIR
from app.services.demo_analyzer import DemoWorkflowAnalyzer
from app.services.openai_analyzer import OpenAIWorkflowAnalyzer
from app.services.workflow_tester import run_invoice_tests

router = APIRouter(prefix="/api/v1/workflows", tags=["workflows"])


@router.get("/demo", response_model=WorkflowIR)
def demo_workflow() -> WorkflowIR:
    return DemoWorkflowAnalyzer().analyze("invoice approval")


@router.post("/analyze", response_model=WorkflowIR)
def analyze_workflow(request: AnalyzeRequest) -> WorkflowIR:
    settings = get_settings()
    try:
        analyzer = (
            DemoWorkflowAnalyzer()
            if settings.flowwright_demo_mode
            else OpenAIWorkflowAnalyzer(settings)
        )
        return analyzer.analyze(
            request.task_description,
            transcript=request.transcript,
            browser_event_log=request.browser_event_log,
            screenshots=request.screenshots,
        )
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc


@router.post("/test", response_model=TestRunResponse)
def test_workflow(workflow: WorkflowIR) -> TestRunResponse:
    if workflow.id != "invoice-approval-demo":
        raise HTTPException(
            status_code=400,
            detail="Only the synthetic invoice workflow is supported in the prototype",
        )
    return TestRunResponse(workflow_id=workflow.id, results=run_invoice_tests(workflow))
