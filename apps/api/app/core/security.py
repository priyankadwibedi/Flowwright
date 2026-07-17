"""Request limits, rate limiting, and safe request logging middleware."""

from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict, deque
from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import Settings

logger = logging.getLogger("flowwright.security")


class RequestGuardMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, settings: Settings) -> None:  # noqa: ANN001
        super().__init__(app)
        self.settings = settings
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._daily: dict[str, tuple[str, int]] = {}

    def _client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip() or "unknown"
        return request.client.host if request.client else "unknown"

    def _rate_limited(self, ip: str) -> bool:
        now = time.time()
        window = self.settings.rate_limit_window_seconds
        bucket = self._hits[ip]
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= self.settings.rate_limit_requests:
            return True
        bucket.append(now)
        return False

    def _quota_exceeded(self, ip: str) -> bool:
        day = time.strftime("%Y-%m-%d", time.gmtime())
        current_day, count = self._daily.get(ip, (day, 0))
        if current_day != day:
            count = 0
            current_day = day
        if count >= self.settings.anonymous_daily_quota:
            return True
        self._daily[ip] = (current_day, count + 1)
        return False

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
        ip = self._client_ip(request)

        token = self.settings.hackathon_access_token
        if token and request.url.path.startswith("/api/"):
            provided = request.headers.get("x-flowwright-token", "")
            if provided != token:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Hackathon access token required", "request_id": request_id},
                    headers={"X-Request-ID": request_id},
                )

        if request.url.path.startswith("/api/"):
            if self._rate_limited(ip):
                logger.warning(
                    "rate_limited request_id=%s ip=%s path=%s",
                    request_id,
                    ip,
                    request.url.path,
                )
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Application rate limit exceeded", "request_id": request_id},
                    headers={"X-Request-ID": request_id},
                )
            if self._quota_exceeded(ip):
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Anonymous daily quota exhausted",
                        "request_id": request_id,
                    },
                    headers={"X-Request-ID": request_id},
                )

        if request.method in {"POST", "PUT", "PATCH"}:
            content_length = request.headers.get("content-length")
            content_type = request.headers.get("content-type", "")
            if (
                content_length
                and content_length.isdigit()
                and int(content_length) > self.settings.max_json_body_bytes
                and content_type.startswith("application/json")
            ):
                return JSONResponse(
                    status_code=413,
                    content={"detail": "JSON body too large", "request_id": request_id},
                    headers={"X-Request-ID": request_id},
                )

        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "unhandled_error request_id=%s path=%s", request_id, request.url.path
            )
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error", "request_id": request_id},
                headers={"X-Request-ID": request_id},
            )
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "request request_id=%s method=%s path=%s status=%s duration_ms=%s",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response
