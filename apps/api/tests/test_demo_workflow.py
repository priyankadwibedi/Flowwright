def test_demo_workflow_endpoint(client):
    response = client.get("/api/v1/workflows/demo")
    assert response.status_code == 200
    assert response.json()["id"] == "invoice-approval-demo"


def test_demo_mode_analyze_without_key(client):
    response = client.post(
        "/api/v1/workflows/analyze", json={"task_description": "Approve invoices"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Invoice approval"


def test_invoice_test_cases(client):
    workflow = client.get("/api/v1/workflows/demo").json()
    response = client.post("/api/v1/workflows/test", json=workflow)
    assert response.status_code == 200
    assert [result["actual_outcome"] for result in response.json()["results"]] == [
        "approved",
        "exception",
        "human_review",
        "human_review",
    ]
