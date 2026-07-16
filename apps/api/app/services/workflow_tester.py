"""Runtime test runner for the synthetic invoice workflow."""

from datetime import UTC, datetime
from time import perf_counter

from app.models.workflow import TestExecution, TestRunResponse, WorkflowIR
from app.services.invoice_runtime import process_fixture


def run_invoice_tests(workflow: WorkflowIR) -> TestRunResponse:
    started_at = datetime.now(UTC)
    executions: list[TestExecution] = []
    for test in workflow.tests:
        filename = str(test.input_case.get("invoice_file", ""))
        started = perf_counter()
        result = process_fixture(filename)
        duration_ms = (perf_counter() - started) * 1000
        expected = test.expected_outcome
        actual = result.status.value
        passed = actual == expected
        status = "passed" if passed else "failed"
        if actual == "human_review" and passed:
            status = "human_review"
        executions.append(
            TestExecution(
                test_id=test.id,
                name=test.name,
                input_case={"invoice_file": filename},
                expected_outcome=expected,
                actual_outcome=actual,
                status=status,  # type: ignore[arg-type]
                duration_ms=round(duration_ms, 3),
                explanation=result.reason,
                logs=["restricted invoice runtime", "no unsafe actions executed"],
            )
        )
    completed_at = datetime.now(UTC)
    return TestRunResponse(
        workflow_id=workflow.id,
        started_at=started_at,
        completed_at=completed_at,
        executions=executions,
        passed=sum(execution.status == "passed" for execution in executions),
        failed=sum(execution.status == "failed" for execution in executions),
        human_review_count=sum(execution.status == "human_review" for execution in executions),
        unsafe_actions_executed=0,
    )
