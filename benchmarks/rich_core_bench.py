from __future__ import annotations

import argparse
import gc
import json
import os
import statistics
import time
from collections.abc import Callable
from typing import Any

import rich_core_native

from app.services.renderer import build_input_rich_message


def paragraph_32k() -> list[dict[str, Any]]:
    text = "x" * 32_000
    return [{
        "id": "long-text",
        "type": "paragraph",
        "position": 0,
        "data": {"text": text, "html": f"<p>{text}</p>"},
    }]


def table_50x5(*, long_cells: bool) -> list[dict[str, Any]]:
    size = 128 if long_cells else 8
    rows: list[list[dict[str, Any]]] = []
    for row in range(5):
        current = []
        for column in range(50):
            prefix = f"r{row}c{column}:"
            text = prefix + ("x" * max(0, size - len(prefix)))
            current.append({"text": text, "html": f"<b>{text}</b>"})
        rows.append(current)
    return [{
        "id": "table-50x5",
        "type": "table",
        "position": 0,
        "data": {"rows": rows, "is_compact": True},
    }]


def attachments_50(*, long_captions: bool) -> list[dict[str, Any]]:
    caption_size = 640 if long_captions else 12
    blocks: list[dict[str, Any]] = []
    for index in range(50):
        prefix = f"file-{index:02d}:"
        caption = prefix + ("x" * max(0, caption_size - len(prefix)))
        blocks.append({
            "id": f"document-{index:02d}",
            "type": "document",
            "position": index,
            "data": {
                "file": {
                    "file_id": f"telegram-file-id-{index:02d}",
                    "file_name": f"file-{index:02d}.bin",
                },
                "caption_text": caption,
                "caption_html": f"<b>{caption}</b>",
            },
        })
    return blocks


def render(blocks: list[dict[str, Any]], *, native: bool) -> dict[str, Any]:
    os.environ["RICH_CORE_NATIVE"] = "1" if native else "0"
    return build_input_rich_message(blocks).model_dump(mode="json", exclude_none=True)


def median_ms(callback: Callable[[], object], iterations: int) -> float:
    samples: list[float] = []
    for _ in range(3):
        callback()
    gc.collect()
    for _ in range(iterations):
        started = time.perf_counter_ns()
        callback()
        samples.append((time.perf_counter_ns() - started) / 1_000_000)
    return statistics.median(samples)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=30)
    args = parser.parse_args()

    scenarios: list[tuple[str, list[dict[str, Any]]]] = [
        ("long_text_32k", paragraph_32k()),
        ("wide_table_50x5_short", table_50x5(long_cells=False)),
        ("wide_attachments_50_short", attachments_50(long_captions=False)),
        ("combined_table_50x5_~32k", table_50x5(long_cells=True)),
        ("combined_attachments_50_~32k", attachments_50(long_captions=True)),
    ]

    print("| scenario | Python fallback ms | Rust direct ms | speedup |")
    print("|---|---:|---:|---:|")
    for name, blocks in scenarios:
        fallback_output = render(blocks, native=False)
        native_output = render(blocks, native=True)
        if fallback_output != native_output:
            raise RuntimeError(f"native/fallback output mismatch for {name}")
        python_ms = median_ms(lambda: render(blocks, native=False), args.iterations)
        rust_ms = median_ms(lambda: render(blocks, native=True), args.iterations)
        speedup = python_ms / rust_ms if rust_ms else float("inf")
        print(f"| {name} | {python_ms:.3f} | {rust_ms:.3f} | {speedup:.2f}x |")

    html = "".join(
        f'<a href="https://t.me/example?i={index}"><b>{index:02d}-' + ("x" * 620) + "</b></a>"
        for index in range(50)
    )
    direct = median_ms(lambda: rich_core_native.html_to_rich(html), args.iterations)
    json_roundtrip = median_ms(
        lambda: json.loads(rich_core_native.html_to_rich_json(html)),
        args.iterations,
    )
    ratio = json_roundtrip / direct if direct else float("inf")
    print()
    print("| native return path | median ms | relative |")
    print("|---|---:|---:|")
    print(f"| direct PyO3 objects | {direct:.3f} | 1.00x |")
    print(f"| JSON string + json.loads | {json_roundtrip:.3f} | {ratio:.2f}x |")


if __name__ == "__main__":
    main()
