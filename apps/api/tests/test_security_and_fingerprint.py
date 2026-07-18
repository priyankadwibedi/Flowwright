from app.core.config import get_settings
from app.core.security import RequestGuardMiddleware
from app.services.demo_analyzer import DemoWorkflowAnalyzer
from app.services.invoice_compiler import config_fingerprint, extract_invoice_compiler_config


def test_expensive_paths_include_actual_media_routes():
    middleware = RequestGuardMiddleware(app=None, settings=get_settings())
    assert middleware._is_expensive_path("/api/v1/media/process-demonstration")
    assert middleware._is_expensive_path("/api/v1/media/keyframes")
    assert middleware._is_expensive_path("/api/v1/workflows/analyze")
    assert middleware._is_expensive_path("/api/v1/workflows/artifact")
    assert middleware._is_expensive_path("/api/v1/invoices/process")
    assert not middleware._is_expensive_path("/api/v1/media/process")
    assert not middleware._is_expensive_path("/health")


def test_config_fingerprint_is_sha256_hex():
    workflow = DemoWorkflowAnalyzer().analyze("invoice approval")
    config = extract_invoice_compiler_config(workflow)
    fingerprint = config_fingerprint(config)
    assert len(fingerprint) == 64
    assert all(char in "0123456789abcdef" for char in fingerprint)
    assert fingerprint == config_fingerprint(config)
