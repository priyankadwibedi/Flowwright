"""Bounded, ephemeral video frame extraction with OpenCV and FFmpeg fallback."""

import base64
import os
import re
import shutil
import subprocess
import tempfile
from contextlib import suppress
from pathlib import Path
from typing import BinaryIO

import cv2

from app.models.workflow import CapturedFrame


class KeyframeExtractionError(RuntimeError):
    """Raised when a supported video cannot be decoded or encoded."""


def _ffmpeg_binaries() -> tuple[str | None, str | None]:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if ffmpeg:
        return ffmpeg, ffprobe
    try:
        from imageio_ffmpeg import get_ffmpeg_exe

        bundled = get_ffmpeg_exe()
        return bundled, None
    except Exception:  # noqa: BLE001 - optional dependency / download failure
        return None, None


def _ffprobe_duration(video_path: Path) -> float:
    ffmpeg, ffprobe = _ffmpeg_binaries()
    if ffprobe:
        try:
            result = subprocess.run(
                [
                    ffprobe,
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    str(video_path),
                ],
                capture_output=True,
                check=False,
                text=True,
                timeout=15,
            )
            return max(0.0, float(result.stdout.strip())) if result.returncode == 0 else 0.0
        except (OSError, ValueError, subprocess.SubprocessError):
            return 0.0
    if not ffmpeg:
        return 0.0
    try:
        result = subprocess.run(
            [ffmpeg, "-i", str(video_path), "-f", "null", "-"],
            capture_output=True,
            check=False,
            text=True,
            timeout=30,
        )
        match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", result.stderr or "")
        if not match:
            return 0.0
        hours, minutes, seconds = match.groups()
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    except (OSError, ValueError, subprocess.SubprocessError):
        return 0.0


def _extract_with_ffmpeg(
    video_path: Path,
    max_keyframes: int,
    max_width: int,
) -> tuple[float, list[CapturedFrame]]:
    ffmpeg, _ = _ffmpeg_binaries()
    if not ffmpeg:
        raise KeyframeExtractionError(
            "OpenCV could not decode this browser recording and FFmpeg is not "
            "available. Install FFmpeg (winget install FFmpeg) or upload an MP4."
        )
    duration = _ffprobe_duration(video_path)
    sample_rate = max_keyframes / max(duration, 1.0)
    with tempfile.TemporaryDirectory(prefix="flowwright-frames-") as directory:
        output_pattern = str(Path(directory) / "frame-%03d.jpg")
        # -fflags +genpts helps Chrome MediaRecorder WebM without clean timestamps.
        result = subprocess.run(
            [
                ffmpeg,
                "-v",
                "error",
                "-fflags",
                "+genpts",
                "-i",
                str(video_path),
                "-vf",
                f"fps={sample_rate:.6f},scale={max_width}:-2:force_original_aspect_ratio=decrease",
                "-frames:v",
                str(max_keyframes),
                "-q:v",
                "3",
                "-y",
                output_pattern,
            ],
            capture_output=True,
            check=False,
            timeout=60,
        )
        if result.returncode != 0:
            detail = (result.stderr or b"").decode("utf-8", errors="replace")[-400:]
            raise KeyframeExtractionError(
                "FFmpeg failed while extracting key frames from the uploaded video"
                + (f": {detail}" if detail else "")
            )
        frames: list[CapturedFrame] = []
        for frame_index, image_path in enumerate(sorted(Path(directory).glob("frame-*.jpg"))):
            image = cv2.imread(str(image_path))
            if image is None:
                continue
            height, width = image.shape[:2]
            encoded_success, encoded = cv2.imencode(".jpg", image)
            if not encoded_success:
                continue
            frames.append(
                CapturedFrame(
                    id=f"frame-ffmpeg-{frame_index}",
                    frame_index=frame_index,
                    timestamp_seconds=round(frame_index / sample_rate, 3),
                    width=int(width),
                    height=int(height),
                    mime_type="image/jpeg",
                    image_base64=base64.b64encode(encoded.tobytes()).decode("ascii"),
                )
            )
        if not frames:
            raise KeyframeExtractionError("FFmpeg produced no readable key frames")
        return duration, frames


def _read_frames_sequentially(
    capture: cv2.VideoCapture,
    max_keyframes: int,
    max_width: int,
    jpeg_quality: int,
    fps: float,
) -> list[CapturedFrame]:
    """Read frames without trusting CAP_PROP_FRAME_COUNT (often 0 for Chrome WebM)."""
    collected: list[tuple[int, object]] = []
    index = 0
    while True:
        success, frame = capture.read()
        if not success or frame is None:
            break
        collected.append((index, frame))
        index += 1
        # Cap scan so pathological files cannot hang the worker.
        if index >= 3_000:
            break
    if not collected:
        return []
    frame_count = len(collected)
    sample_count = min(max_keyframes, frame_count)
    indices = sorted(
        {
            round(i * (frame_count - 1) / max(1, sample_count - 1))
            for i in range(sample_count)
        }
    )
    frames: list[CapturedFrame] = []
    by_index = dict(collected)
    for sample_index in indices:
        frame = by_index[sample_index]
        height, width = frame.shape[:2]
        if width > max_width:
            resized_height = max(1, round(height * max_width / width))
            frame = cv2.resize(
                frame, (max_width, resized_height), interpolation=cv2.INTER_AREA
            )
            height, width = frame.shape[:2]
        encoded_success, encoded = cv2.imencode(
            ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality]
        )
        if not encoded_success:
            continue
        frames.append(
            CapturedFrame(
                id=f"frame-{sample_index}",
                frame_index=sample_index,
                timestamp_seconds=round(sample_index / fps, 3) if fps > 0 else 0.0,
                width=int(width),
                height=int(height),
                mime_type="image/jpeg",
                image_base64=base64.b64encode(encoded.tobytes()).decode("ascii"),
            )
        )
    return frames


def extract_keyframes(
    file: BinaryIO,
    suffix: str,
    max_keyframes: int,
    max_width: int = 1280,
    jpeg_quality: int = 75,
) -> tuple[float, list[CapturedFrame]]:
    """Extract representative JPEG frames and always delete the temporary video."""
    if max_keyframes < 1:
        raise KeyframeExtractionError("At least one key frame is required")
    if not suffix.startswith("."):
        raise KeyframeExtractionError("Unsupported video suffix")

    temporary_path: Path | None = None
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
        temporary_path = Path(temporary.name)
        while chunk := file.read(1024 * 1024):
            temporary.write(chunk)
    capture: cv2.VideoCapture | None = None
    try:
        if temporary_path.stat().st_size == 0:
            raise KeyframeExtractionError("The uploaded video is empty")

        capture = cv2.VideoCapture(str(temporary_path))
        if not capture.isOpened():
            return _extract_with_ffmpeg(temporary_path, max_keyframes, max_width)

        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)

        # Chrome MediaRecorder WebM often reports frame_count=0 even when frames exist.
        if frame_count <= 0:
            sequential = _read_frames_sequentially(
                capture, max_keyframes, max_width, jpeg_quality, fps or 30.0
            )
            if sequential:
                duration = (
                    round((sequential[-1].frame_index) / fps, 3) if fps > 0 else 0.0
                )
                return duration, sequential
            capture.release()
            capture = None
            return _extract_with_ffmpeg(temporary_path, max_keyframes, max_width)

        duration = round((frame_count - 1) / fps, 3) if fps > 0 else 0.0
        sample_count = min(max_keyframes, frame_count)
        indices = sorted(
            {
                round(i * (frame_count - 1) / max(1, sample_count - 1))
                for i in range(sample_count)
            }
        )
        frames: list[CapturedFrame] = []
        for index in indices:
            capture.set(cv2.CAP_PROP_POS_FRAMES, index)
            success, frame = capture.read()
            if not success or frame is None:
                continue
            height, width = frame.shape[:2]
            if width > max_width:
                resized_height = max(1, round(height * max_width / width))
                frame = cv2.resize(
                    frame, (max_width, resized_height), interpolation=cv2.INTER_AREA
                )
                height, width = frame.shape[:2]
            encoded_success, encoded = cv2.imencode(
                ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality]
            )
            if not encoded_success:
                raise KeyframeExtractionError(f"Could not encode frame {index} as JPEG")
            frames.append(
                CapturedFrame(
                    id=f"frame-{index}",
                    frame_index=index,
                    timestamp_seconds=round(index / fps, 3) if fps > 0 else 0.0,
                    width=int(width),
                    height=int(height),
                    mime_type="image/jpeg",
                    image_base64=base64.b64encode(encoded.tobytes()).decode("ascii"),
                )
            )
        if not frames:
            capture.release()
            capture = None
            return _extract_with_ffmpeg(temporary_path, max_keyframes, max_width)
        return duration, frames
    except cv2.error:
        if temporary_path is not None:
            return _extract_with_ffmpeg(temporary_path, max_keyframes, max_width)
        raise KeyframeExtractionError(
            "OpenCV failed while decoding the uploaded video"
        ) from None
    finally:
        if capture is not None:
            capture.release()
        if temporary_path is not None:
            with suppress(FileNotFoundError):
                os.unlink(temporary_path)
