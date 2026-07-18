def _approval_payload(workflow: dict, compiler_fingerprint: str) -> dict:
    return {
        "invoice_file": "invoice-exact-match.json",
        "confirm": True,
        "workflow": workflow,
        "compiled_workflow_id": workflow["id"],
        "compiler_fingerprint": compiler_fingerprint,
        "decision": "approved",
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
    detail = response.json()["detail"]
    assert "AI analysis is unavailable on this deployment" in detail
    assert "FLOWWRIGHT_DEMO_MODE=false" in detail
    assert "Record page" not in detail
    assert "turn demo mode off" not in detail.lower()


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

    compiler_fingerprint = response.json()["compiler_fingerprint"]
    assert len(compiler_fingerprint) == 64
    approval = client.post(
        "/api/v1/invoices/approve",
        json=_approval_payload(workflow, compiler_fingerprint),
    )
    assert approval.status_code == 200
    payload = approval.json()
    assert payload["status"] == "approved"
    assert payload["compiled_workflow_id"] == workflow["id"]
    assert payload["compiler_fingerprint"] == compiler_fingerprint
    assert payload["protected_action_executed"] is False
    assert payload["persistent"] is False
    assert payload["payment_executed"] is False
    assert "recorded_at" in payload
    assert payload["approval_record_id"].startswith("synthetic-receipt-")

    second = client.post(
        "/api/v1/invoices/approve",
        json=_approval_payload(workflow, compiler_fingerprint),
    )
    assert second.status_code == 200
    assert second.json()["approval_record_id"] != payload["approval_record_id"]

    missing_identity = client.post(
        "/api/v1/invoices/approve",
        json={"invoice_file": "invoice-exact-match.json", "confirm": True},
    )
    assert missing_identity.status_code == 422

    blocked_approval = client.post(
        "/api/v1/invoices/approve",
        json={
            **_approval_payload(workflow, compiler_fingerprint),
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
    assert artifact.json()["compiler_fingerprint"] == compiler_fingerprint


def test_approval_rejects_client_timestamp(client):
    workflow = client.get("/api/v1/workflows/demo").json()
    process = client.post(
        "/api/v1/invoices/process",
        json={"invoice_file": "invoice-exact-match.json", "workflow": workflow},
    )
    assert process.status_code == 200
    fingerprint = process.json()["compiler_fingerprint"]
    response = client.post(
        "/api/v1/invoices/approve",
        json={
            **_approval_payload(workflow, fingerprint),
            "timestamp": "2020-01-01T00:00:00Z",
        },
    )
    assert response.status_code == 422
    recorded = client.post(
        "/api/v1/invoices/approve",
        json=_approval_payload(workflow, fingerprint),
    )
    assert recorded.status_code == 200
    assert "timestamp" not in recorded.json() or "recorded_at" in recorded.json()
    assert recorded.json()["recorded_at"]

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
