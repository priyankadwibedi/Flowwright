"""Transcription request-shape and status mapping tests."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from openai import APITimeoutError, RateLimitError

from app.core.config import Settings
from app.services.evidence_processor import (
    _transcribe,
    build_transcription_request_kwargs,
    validate_transcription_model,
)


def test_gpt_transcription_request_shape():
    kwargs = build_transcription_request_kwargs("gpt-4o-mini-transcribe")
    assert kwargs == {"model": "gpt-4o-mini-transcribe", "response_format": "json"}
    assert "timestamp_granularities" not in kwargs


def test_whisper_transcription_request_shape():
    kwargs = build_transcription_request_kwargs("whisper-1")
    assert kwargs["response_format"] == "verbose_json"
    assert kwargs["timestamp_granularities"] == ["segment"]


def test_invalid_transcription_model():
    with pytest.raises(ValueError):
        validate_transcription_model("not-a-model")


def test_missing_audio_and_api_key():
    settings = Settings(openai_api_key=None)
    assert _transcribe(None, settings)[2] == "missing_api_key"
    settings = Settings(openai_api_key="sk-test")
    assert _transcribe(None, settings)[2] == "missing_audio"
    assert _transcribe(b"", settings)[2] == "missing_audio"


def test_successful_gpt_transcript_synthetic_segment():
    settings = Settings(
        openai_api_key="sk-test",
        openai_transcription_model="gpt-4o-mini-transcribe",
    )
    fake = SimpleNamespace(text="Invoice total matches the purchase order.")
    with patch("app.services.evidence_processor.OpenAI") as client_cls:
        client = MagicMock()
        client.audio.transcriptions.create.return_value = fake
        client_cls.return_value = client
        text, segments, status = _transcribe(b"RIFF", settings, duration_seconds=12.5)
    assert status == "available"
    assert text.startswith("Invoice total")
    assert len(segments) == 1
    assert segments[0].end_seconds == 12.5
    kwargs = client.audio.transcriptions.create.call_args.kwargs
    assert kwargs["response_format"] == "json"
    assert "timestamp_granularities" not in kwargs


def test_successful_whisper_segments():
    settings = Settings(
        openai_api_key="sk-test",
        openai_transcription_model="whisper-1",
    )
    fake = SimpleNamespace(
        text="one two",
        segments=[
            SimpleNamespace(start=0.0, end=1.0, text="one"),
            SimpleNamespace(start=1.0, end=2.0, text="two"),
        ],
    )
    with patch("app.services.evidence_processor.OpenAI") as client_cls:
        client = MagicMock()
        client.audio.transcriptions.create.return_value = fake
        client_cls.return_value = client
        text, segments, status = _transcribe(b"RIFF", settings, duration_seconds=2)
    assert status == "available"
    assert text == "one two"
    assert [item.text for item in segments] == ["one", "two"]


def test_rate_limit_and_timeout_and_invalid():
    settings = Settings(
        openai_api_key="sk-test",
        openai_transcription_model="gpt-4o-mini-transcribe",
    )
    with patch("app.services.evidence_processor.OpenAI") as client_cls:
        client = MagicMock()
        client.audio.transcriptions.create.side_effect = RateLimitError(
            "rate", response=MagicMock(status_code=429, headers={}), body=None
        )
        client_cls.return_value = client
        assert _transcribe(b"RIFF", settings)[2] == "rate_limited"

    with patch("app.services.evidence_processor.OpenAI") as client_cls:
        client = MagicMock()
        client.audio.transcriptions.create.side_effect = APITimeoutError(request=MagicMock())
        client_cls.return_value = client
        assert _transcribe(b"RIFF", settings)[2] == "timeout"

    with patch("app.services.evidence_processor.OpenAI") as client_cls:
        client = MagicMock()
        client.audio.transcriptions.create.return_value = SimpleNamespace(text="")
        client_cls.return_value = client
        assert _transcribe(b"RIFF", settings)[2] == "invalid_response"
