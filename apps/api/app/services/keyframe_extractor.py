"""Ephemeral video key-frame extraction with OpenCV."""

import os
import tempfile
from contextlib import suppress
from pathlib import Path
from typing import BinaryIO

import cv2


class KeyframeExtractionError(RuntimeError):
    """Raised when a supported video cannot be decoded."""


def extract_keyframes(file: BinaryIO, suffix: str, max_keyframes: int) -> list[dict[str, object]]:
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
        temporary_path = Path(temporary.name)
        while chunk := file.read(1024 * 1024):
            temporary.write(chunk)
    try:
        capture = cv2.VideoCapture(str(temporary_path))
        if not capture.isOpened():
            raise KeyframeExtractionError("FFmpeg/OpenCV could not open the uploaded video")
        frame_count, fps = (
            int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0),
            float(capture.get(cv2.CAP_PROP_FPS) or 0),
        )
        if frame_count <= 0:
            raise KeyframeExtractionError("The uploaded video contains no readable frames")
        indices = sorted(
            {round(i * (frame_count - 1) / max(1, max_keyframes - 1)) for i in range(max_keyframes)}
        )
        metadata: list[dict[str, object]] = []
        for index in indices:
            capture.set(cv2.CAP_PROP_POS_FRAMES, index)
            success, frame = capture.read()
            if success and frame is not None:
                metadata.append(
                    {
                        "frame_index": index,
                        "timestamp_seconds": round(index / fps, 3) if fps else None,
                        "width": int(frame.shape[1]),
                        "height": int(frame.shape[0]),
                    }
                )
        capture.release()
        if not metadata:
            raise KeyframeExtractionError("No key frames could be decoded")
        return metadata
    finally:
        with suppress(FileNotFoundError):
            os.unlink(temporary_path)
