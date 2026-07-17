from datetime import UTC, datetime


def _approval_payload(workflow: dict, compiler_hash: str) -> dict:
    return {
        "invoice_file": "invoice-exact-match.json",
        "confirm": True,
        "workflow": workflow,
        "compiled_workflow_id": workflow["id"],
        "compiler_hash": compiler_hash,
        "decision": "approved",
        "timestamp": datetime.now(UTC).isoformat(),
    }


def test_demo_workflow_endpoint(client):
    response = client.get("/api/v1/workflows/demo")
    assert response.status_code == 200
    assert response.json()["id"] == "invoice-approval-demo"


def test_demo_mode_analyze_without_key(client):
    response = client.post(
        "/api/v1/workflows/analyze", json={"task_description": "Approve invoices"}
    )
    assert response.status_code == 503
    assert "FLOWWRIGHT_DEMO_MODE" in response.json()["detail"]


def test_invoice_test_cases(client):
    workflow = client.get("/api/v1/workflows/demo").json()
    response = client.post("/api/v1/workflows/test", json=workflow)
    assert response.status_code == 200
    assert [result["actual_outcome"] for result in response.json()["executions"]] == [
        "approval_required",
        "exception",
        "human_review",
        "human_review",
        "exception",
        "exception",
    ]
    assert response.json()["mandatory_test_count"] == 6


def test_invoice_runtime_and_trusted_artifact(client):
    workflow = client.get("/api/v1/workflows/demo").json()
    response = client.post(
        "/api/v1/invoices/process",
        json={"invoice_file": "invoice-exact-match.json", "workflow": workflow},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "approval_required"
    assert response.json()["protected_action_executed"] is False

    compiler_hash = response.json()["compiler_fingerprint"]
    approval = client.post(
        "/api/v1/invoices/approve",
        json=_approval_payload(workflow, compiler_hash),
    )
    assert approval.status_code == 200
    assert approval.json()["status"] == "approved"
    assert approval.json()["compiled_workflow_id"] == workflow["id"]
    assert approval.json()["compiler_hash"] == compiler_hash
    assert approval.json()["protected_action_executed"] is False

    missing_identity = client.post(
        "/api/v1/invoices/approve",
        json={"invoice_file": "invoice-exact-match.json", "confirm": True},
    )
    assert missing_identity.status_code == 422

    blocked_approval = client.post(
        "/api/v1/invoices/approve",
        json={
            **_approval_payload(workflow, compiler_hash),
            "invoice_file": "invoice-amount-mismatch.json",
        },
    )
    assert blocked_approval.status_code == 422

    artifact = client.post(
        "/api/v1/workflows/generate",
        json=workflow,
    )
    assert artifact.status_code == 200
    assert {file["path"] for file in artifact.json()["files"]} >= {
        "workflow.py",
        "test_workflow.py",
    }


def test_required_uncertainty_blocks_generation_until_resolved(client):
    workflow = client.get("/api/v1/workflows/demo").json()
    workflow["uncertainties"][0]["required"] = True
    blocked = client.post("/api/v1/workflows/generate", json=workflow)
    assert blocked.status_code == 422
    resolved = client.post(
        "/api/v1/workflows/resolve",
        json={
            "workflow": workflow,
            "answers": [{"question_id": "exception-delivery", "answer": "draft"}],
        },
    )
    assert resolved.status_code == 200
    assert resolved.json()["workflow"]["uncertainties"] == []
