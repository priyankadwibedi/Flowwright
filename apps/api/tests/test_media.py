def test_upload_type_validation(client):
    response = client.post(
        "/api/v1/media/keyframes", files={"file": ("notes.txt", b"not a video", "text/plain")}
    )
    assert response.status_code == 415
