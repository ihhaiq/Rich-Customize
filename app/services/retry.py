from __future__ import annotations

import random


def retry_after_delay(
    retry_after: float,
    attempt: int,
    *,
    base: float = 0.5,
    cap: float = 30.0,
) -> float:
    """Honor Telegram retry_after and add bounded exponential backoff with jitter."""
    exponent = max(0, attempt)
    backoff = min(cap, base * (2 ** exponent))
    jitter = random.uniform(0.0, min(1.0, backoff * 0.25))
    return max(float(retry_after), backoff + jitter)


__all__ = ["retry_after_delay"]
