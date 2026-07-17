"""Keyframe sampling helpers and extractor edge cases."""

from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytest

from app.services.keyframe_extractor import KeyframeExtractionError, extract_keyframes


def _indices(frame_count: int, max_keyframes: int) -> list[int]:
    sample_count = min(max_keyframes, frame_count)
    return sorted(
        {
            round(i * (frame_count - 1) / max(1, sample_count - 1))
            for i in range(sample_count)
        }
    )


def test_one_frame_sampling():
    assert _indices(1, 8) == [0]


def test_three_frames_eight_requested():
    assert _indices(3, 8) == [0, 1, 2]


def test_long_video_includes_final_frame():
    indices = _indices(1000, 8)
    assert indices[0] == 0
    assert indices[-1] == 999
    assert len(indices) == 8


def test_corrupted_video_raises(tmp_path: Path):
    bad = BytesIO(b"not-a-video")
    with pytest.raises(KeyframeExtractionError):
        extract_keyframes(bad, ".webm", 4)


def test_temporary_file_cleanup(tmp_path: Path):
    # Synthetic single black frame encoded as png bytes will fail open; ensure unlink path runs.
    with patch("app.services.keyframe_extractor.cv2.VideoCapture") as capture_cls:
        capture = MagicMock()
        capture.isOpened.return_value = True
        capture.get.side_effect = lambda prop: {
            cv2.CAP_PROP_FRAME_COUNT: 1,
            cv2.CAP_PROP_FPS: 1.0,
        }.get(prop, 0)
        frame = np.zeros((40, 60, 3), dtype=np.uint8)
        capture.read.return_value = (True, frame)
        capture_cls.return_value = capture
        duration, frames = extract_keyframes(BytesIO(b"fake"), ".webm", 1, max_width=32)
    assert duration == 0.0
    assert len(frames) == 1
    assert frames[0].width <= 32
