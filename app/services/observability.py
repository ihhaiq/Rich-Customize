from __future__ import annotations

import orjson
import logging
import os
import re
import resource
import sys
from datetime import datetime, timezone
from typing import Any

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

from app.services.context import correlation_id


REQUEST_DURATION = Histogram(
    "rich_update_handler_seconds",
    "Telegram update handler latency.",
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10),
)
ERRORS = Counter("rich_handler_errors_total", "Unhandled handler errors.")
PUBLISH = Counter(
    "rich_publish_total",
    "Publish attempts by outcome.",
    labelnames=("outcome",),
)
DB_LATENCY = Gauge("rich_database_latency_ms", "Last PostgreSQL latency in milliseconds.")
ACTIVE_EDITORS = Gauge("rich_active_editors", "Active editor sessions.")
REDIS_CONNECTED = Gauge("rich_redis_connected", "Whether Redis is connected (1/0).")


_SECRET_RE = re.compile(r"\b\d{6,12}:[A-Za-z0-9_-]{20,}\b")
_ID_RE = re.compile(r"\b(user_id|chat_id|message_id|bot_id|owner_id)=(-?\d+)\b")


def _redact(message: str) -> str:
    message = _SECRET_RE.sub("<redacted-token>", message)
    return _ID_RE.sub(lambda match: f"{match.group(1)}=<redacted>", message)


def _scrub_sentry_value(value: Any) -> Any:
    if isinstance(value, str):
        return _redact(value)
    if isinstance(value, list):
        return [_scrub_sentry_value(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_scrub_sentry_value(item) for item in value)
    if isinstance(value, dict):
        result: dict[Any, Any] = {}
        for key, item in value.items():
            if str(key).casefold() in {
                "token",
                "bot_token",
                "authorization",
                "password",
                "database_url",
                "redis_url",
            }:
                result[key] = "<redacted>"
            else:
                result[key] = _scrub_sentry_value(item)
        return result
    return value


def _sentry_before_send(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any]:
    scrubbed = _scrub_sentry_value(event)
    return scrubbed if isinstance(scrubbed, dict) else event


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        message = _redact(record.getMessage())
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": message,
            "correlation_id": correlation_id.get(),
        }
        if record.exc_info:
            payload["exception"] = _redact(self.formatException(record.exc_info))
        return orjson.dumps(payload).decode("utf-8")


def configure_observability(log_level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(getattr(logging, log_level, logging.INFO))

    dsn = os.getenv("SENTRY_DSN", "").strip()
    if dsn:
        try:
            import sentry_sdk

            sentry_sdk.init(
                dsn=dsn,
                send_default_pii=False,
                before_send=_sentry_before_send,
                traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0")),
                environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
            )
        except Exception:
            logging.getLogger(__name__).exception("Could not initialize Sentry")


def memory_rss_bytes() -> int:
    try:
        with open("/proc/self/statm", encoding="ascii") as handle:
            pages = int(handle.read().split()[1])
        return pages * os.sysconf("SC_PAGE_SIZE")
    except (OSError, ValueError, IndexError):
        usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return int(usage * (1024 if sys.platform != "darwin" else 1))


def prometheus_payload() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST


__all__ = [
    "ACTIVE_EDITORS",
    "DB_LATENCY",
    "ERRORS",
    "PUBLISH",
    "REDIS_CONNECTED",
    "REQUEST_DURATION",
    "_sentry_before_send",
    "configure_observability",
    "memory_rss_bytes",
    "prometheus_payload",
]
