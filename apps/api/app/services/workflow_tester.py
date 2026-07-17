"""Execute trusted generated invoice artifacts in an isolated temporary directory."""

import shutil
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from time import perf_counter

from app.models.workflow import (
    ArtifactExecutionResult,
    TestExecution,
    TestRunResponse,
    WorkflowIR,
)
from app.services.code_generator import GENERATOR_VERSION, generate_invoice_artifact
from app.services.invoice_compiler import config_fingerprint, extract_invoice_compiler_config
from app.services.invoice_runtime import process_fixture

MAX_OPTIONAL_TESTS = 8
ARTIFACT_TIMEOUT_SECONDS = 30


def _server_owned_cases(workflow: WorkflowIR) -> list[tuple[str, str, str]]:
    """Return allowlisted fixture expectations owned by the compiler target."""
    cases = [
        ("exact_match", "invoice-exact-match.json", "approval_required"),
        ("amount_mismatch", "invoice-amount-mismatch.json", "exception"),
        ("missing_purchase_order", "invoice-missing-po.json", "human_review"),
        ("unreadable_invoice_number", "invoice-unreadable-number.json", "human_review"),
        ("currency_mismatch", "invoice-currency-mismatch.json", "exception"),
        ("decimal_tolerance_boundary", "invoice-fifth-live-case.json", "exception"),
    ]
    config = extract_invoice_compiler_config(workflow)
    if config.amount_mismatch_action == "human_review" or (
        config.exception_delivery == "human_review"
    ):
        cases[1] = ("amount_mismatch", "invoice-amount-mismatch.json", "human_review")
    if config.amount_tolerance >= 80:
        cases[1] = ("amount_mismatch", "invoice-amount-mismatch.json", "approval_required")
    if not config.compare_currency:
        cases[4] = ("currency_mismatch", "invoice-currency-mismatch.json", "approval_required")
    if config.amount_tolerance >= Decimal("0.01"):
        cases[5] = (
            "decimal_tolerance_boundary",
            "invoice-fifth-live-case.json",
            "approval_required",
        )
    return cases


def _optional_cases(workflow: WorkflowIR) -> list[tuple[str, str, str]]:
    selected: list[tuple[str, str, str]] = []
    mandatory_ids = {test_id for test_id, _, _ in _server_owned_cases(workflow)}
    for test in workflow.tests[:MAX_OPTIONAL_TESTS]:
        if test.id in mandatory_ids:
            continue
        filename = str(test.input_case.get("invoice_file", ""))
        if filename.endswith(".json") and filename in {
            "invoice-exact-match.json",
            "invoice-amount-mismatch.json",
            "invoice-missing-po.json",
            "invoice-unreadable-number.json",
            "invoice-currency-mismatch.json",
            "invoice-fifth-live-case.json",
        }:
            selected.append((test.id, filename, test.expected_outcome))
    return selected


def _write_artifact(directory: Path, workflow: WorkflowIR) -> list[str]:
    artifact = generate_invoice_artifact(workflow)
    paths: list[str] = []
    for file in artifact.files:
        target = directory / file.path
        target.write_text(file.content, encoding="utf-8")
        paths.append(file.path)
    return paths


def _run_generated_pytest(directory: Path) -> ArtifactExecutionResult:
    started = perf_counter()
    env = {
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
        "PYTHONPATH": str(directory),
    }
    # No shell interpolation; fixed interpreter; temporary cwd; no network needed.
    try:
        completed = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "test_workflow.py"],
            cwd=directory,
            capture_output=True,
            text=True,
            timeout=ARTIFACT_TIMEOUT_SECONDS,
            check=False,
            env=env,
        )
        duration_ms = (perf_counter() - started) * 1000
        return ArtifactExecutionResult(
            exit_code=completed.returncode,
            duration_ms=round(duration_ms, 3),
            stdout=completed.stdout[-8_000:],
            stderr=completed.stderr[-8_000:],
            timed_out=False,
            artifact_paths=["workflow.py", "test_workflow.py"],
        )
    except subprocess.TimeoutExpired as exc:
        duration_ms = (perf_counter() - started) * 1000
        stdout = (
            (exc.stdout or b"").decode("utf-8", errors="replace")
            if isinstance(exc.stdout, bytes)
            else (exc.stdout or "")
        )
        stderr = (
            (exc.stderr or b"").decode("utf-8", errors="replace")
            if isinstance(exc.stderr, bytes)
            else (exc.stderr or "")
        )
        return ArtifactExecutionResult(
            exit_code=124,
            duration_ms=round(duration_ms, 3),
            stdout=str(stdout)[-8_000:],
            stderr=(str(stderr) or "artifact test execution timed out")[-8_000:],
            timed_out=True,
            artifact_paths=["workflow.py", "test_workflow.py"],
        )


def run_invoice_tests(workflow: WorkflowIR) -> TestRunResponse:
    if workflow.workflow_kind != "invoice_approval":
        raise ValueError("Only invoice_approval workflows can execute the trusted artifact")

    started_at = datetime.now(UTC)
    config = extract_invoice_compiler_config(workflow)
    fingerprint = config_fingerprint(config)
    executions: list[TestExecution] = []
    temporary: str | None = None
    artifact_result: ArtifactExecutionResult | None = None

    try:
        temporary = tempfile.mkdtemp(prefix="flowwright-artifact-")
        directory = Path(temporary)
        artifact_paths = _write_artifact(directory, workflow)
        artifact_result = _run_generated_pytest(directory)
        artifact_result = artifact_result.model_copy(
            update={"artifact_paths": artifact_paths}
        )

        mandatory_cases = _server_owned_cases(workflow)
        optional_cases = _optional_cases(workflow)

        # Mirror mandatory and optional fixtures through the shared interpreter for UI rows.
        for test_id, filename, expected in [*mandatory_cases, *optional_cases]:
            started = perf_counter()
            result = process_fixture(filename, workflow)
            duration_ms = (perf_counter() - started) * 1000
            actual = result.status.value
            passed = actual == expected
            status: str = "passed" if passed else "failed"
            if actual == "human_review" and passed:
                status = "human_review"
            # Artifact failure is reported via the dedicated suite execution row.
            executions.append(
                TestExecution(
                    test_id=test_id,
                    name=filename,
                    input_case={"invoice_file": filename},
                    expected_outcome=expected,
                    actual_outcome=actual,
                    status=status,  # type: ignore[arg-type]
                    duration_ms=round(duration_ms, 3),
                    explanation=result.reason,
                    logs=[
                        "trusted generated artifact",
                        f"artifact_exit_code={artifact_result.exit_code}",
                        f"compiler_fingerprint={fingerprint}",
                        "no unsafe actions executed",
                    ],
                )
            )

        if artifact_result.exit_code != 0:
            executions.append(
                TestExecution(
                    test_id="generated_artifact_suite",
                    name="Generated artifact pytest",
                    input_case={"suite": "test_workflow.py"},
                    expected_outcome="exit_code_0",
                    actual_outcome=f"exit_code_{artifact_result.exit_code}",
                    status="failed",
                    duration_ms=artifact_result.duration_ms,
                    explanation=(
                        "Generated artifact tests failed"
                        + (" (timed out)" if artifact_result.timed_out else "")
                    ),
                    logs=[
                        artifact_result.stdout[-2_000:],
                        artifact_result.stderr[-2_000:],
                    ],
                )
            )
    finally:
        if temporary is not None:
            shutil.rmtree(temporary, ignore_errors=True)

    completed_at = datetime.now(UTC)
    return TestRunResponse(
        workflow_id=workflow.id,
        started_at=started_at,
        completed_at=completed_at,
        executions=executions,
        mandatory_test_count=len(mandatory_cases),
        optional_test_count=len(optional_cases),
        passed=sum(execution.status == "passed" for execution in executions),
        failed=sum(execution.status == "failed" for execution in executions),
        human_review_count=sum(
            execution.status == "human_review" for execution in executions
        ),
        unsafe_actions_executed=0,
        artifact_execution=artifact_result,
        generator_version=GENERATOR_VERSION,
        compiler_fingerprint=fingerprint,
    )


def run_broken_artifact_regression(workflow: WorkflowIR) -> TestRunResponse:
    """Deliberately break generated source and assert the suite fails."""
    started_at = datetime.now(UTC)
    temporary = tempfile.mkdtemp(prefix="flowwright-broken-")
    try:
        directory = Path(temporary)
        _write_artifact(directory, workflow)
        workflow_path = directory / "workflow.py"
        broken = workflow_path.read_text(encoding="utf-8").replace(
            "APPROVAL_REQUIRED", "BROKEN_STATUS", 1
        )
        workflow_path.write_text(broken, encoding="utf-8")
        artifact_result = _run_generated_pytest(directory)
        executions = [
            TestExecution(
                test_id="broken_artifact_regression",
                name="Broken generated artifact must fail",
                input_case={"suite": "test_workflow.py"},
                expected_outcome="non_zero_exit",
                actual_outcome=f"exit_code_{artifact_result.exit_code}",
                status="passed" if artifact_result.exit_code != 0 else "failed",
                duration_ms=artifact_result.duration_ms,
                explanation="Regression check that broken generated code fails tests",
                logs=[artifact_result.stdout[-1_000:], artifact_result.stderr[-1_000:]],
            )
        ]
    finally:
        shutil.rmtree(temporary, ignore_errors=True)
    completed_at = datetime.now(UTC)
    return TestRunResponse(
        workflow_id=workflow.id,
        started_at=started_at,
        completed_at=completed_at,
        executions=executions,
        mandatory_test_count=0,
        optional_test_count=0,
        passed=sum(item.status == "passed" for item in executions),
        failed=sum(item.status == "failed" for item in executions),
        human_review_count=0,
        unsafe_actions_executed=0,
        artifact_execution=artifact_result,
        generator_version=GENERATOR_VERSION,
    )
