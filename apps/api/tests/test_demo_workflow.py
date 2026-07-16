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
    ]


def test_invoice_runtime_and_trusted_artifact(client):
    response = client.post(
        "/api/v1/invoices/process",
        json={"invoice_file": "invoice-exact-match.json"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "approval_required"
    assert response.json()["protected_action_executed"] is False

    approval = client.post(
        "/api/v1/invoices/approve",
        json={"invoice_file": "invoice-exact-match.json", "confirm": True},
    )
    assert approval.status_code == 200
    assert approval.json()["status"] == "approved"
    assert approval.json()["protected_action_executed"] is False

    blocked_approval = client.post(
        "/api/v1/invoices/approve",
        json={"invoice_file": "invoice-amount-mismatch.json", "confirm": True},
    )
    assert blocked_approval.status_code == 422

    artifact = client.post(
        "/api/v1/workflows/generate",
        json=client.get("/api/v1/workflows/demo").json(),
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
