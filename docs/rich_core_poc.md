# Rust rich core POC — acceptance notes

This document tracks the review requirements for PR #50. The PR stays Draft until correctness tests and CI actually execute successfully.

## Realistic payload envelope

The stress target is not only long text. The editor must tolerate RichText that is simultaneously wide and deep:

- up to about 32,000 text characters,
- up to 50 attachment blocks in one rich message,
- a table with up to 50 columns and multiple rows,
- nested inline RichText such as bold/italic/links/custom emoji.

## Correctness and stack safety

### Mismatched HTML closing tags

`close_frame()` deliberately mirrors `renderer.py::_RichTextHTMLParser.handle_endtag()`.
Both implementations pop exactly one top frame. If the closing tag does not match that frame, the wrapper is discarded and its children are appended to the parent. A Rust unit test and a Python/native parity test cover this malformed-input contract.

### Deep trees

`plain_rich_text()` is iterative and no longer recursively walks `serde_json::Value`.
The native HTML parser has a safety cap of 256 open frames. Realistic 50+ nesting remains below the cap. Exceeding the cap returns a Python exception from the extension; `app.services.rich_core` catches it and the renderer uses the existing Python parser instead of allowing a Rust panic to terminate the process.

The direct `serde_json::Value` → Python object conversion also has an explicit depth guard.

### Wide trees and ordering

Tests cover:

- 50 sibling RichText wrappers,
- 50 inline button markers,
- 50 table columns across multiple rows,
- empty table cells,
- duplicate table header/cell text,
- exactly 50 document attachment blocks,
- attachment order and `file_id` preservation,
- 50 attachment captions whose aggregate text is about 32K characters.

`compact_content()` uses `Vec::retain()`: one linear pass, in-place, with no second collection allocation. Child order is unchanged.

## Allocation changes

The initial POC allocated a `HashMap<String, String>` for every HTML tag. The parser only consumes two attributes (`href` and `emoji-id`), so the POC now uses a fixed `TagAttrs` structure with two optional strings. Unused attributes are scanned but are not allocated or retained.

Further small-vector/hashbrown tuning is intentionally deferred until profiling identifies an allocation hotspot. Adding another dependency without measurements would make the POC more complex without evidence of benefit.

## Python/Rust boundary

Production calls now return Python objects directly from PyO3. The previous `serde_json::to_string()` → `json.loads()` route remains exposed only as a benchmark/backward-comparison path.

`benchmarks/rich_core_bench.py` measures both boundary strategies and full rich-message building.

## Benchmark matrix

The benchmark intentionally covers different dimensions instead of only input length:

1. `long_text_32k` — 32K text in one paragraph.
2. `wide_table_50x5_short` — 50 columns × 5 rows, short cell text.
3. `wide_attachments_50_short` — 50 attachment blocks with short captions.
4. `combined_table_50x5_~32k` — wide table with about 32K aggregate text.
5. `combined_attachments_50_~32k` — 50 attachments with about 32K aggregate caption text.
6. Direct PyO3-object return vs JSON string + `json.loads()` on a wide/long HTML payload.

The benchmark first asserts that native and Python-fallback serialized rich-message output is identical before timing either path.

### Results

No benchmark numbers are recorded here yet because the previous GitHub Actions attempts for this PR were never assigned a runner (`steps: []`, `runner_id: 0`). The updated workflow writes its benchmark table to the GitHub Actions step summary as soon as a runner actually executes it. Numbers must not be invented from an unexecuted workflow.

Local/CI command:

```bash
python benchmarks/rich_core_bench.py --iterations 30
```

## ABI and Docker

PyO3 uses `abi3-py312`, so the built extension targets the CPython stable ABI with Python 3.12 as its minimum version instead of depending on an exact CPython patch ABI.

The Docker native-builder and runtime currently both use `python:3.12-slim`. BuildKit cache mounts retain Cargo registry/git data and `rich_core/target` between compatible Docker builds.

## CI

The branch workflow now includes:

- `Swatinem/rust-cache@v2`,
- standalone `cargo test --lib`,
- `maturin develop --release`,
- `cargo check`,
- Ruff, mypy, compileall, pytest,
- the multidimensional benchmark written to `$GITHUB_STEP_SUMMARY`.

A green status is only accepted if the job has a real runner and actual steps. A no-runner failure is documented as infrastructure failure, not test success or code failure.

## Explicitly deferred expansion

The Rust POC still accelerates only inline-button scanning/parsing and inline HTML → RichText conversion.

Moving full table validation/serialization or attachment-list construction into Rust is deferred until the benchmark identifies those Python sections as material bottlenecks. Telegram/Aiogram object construction, I/O, FSM, storage, and publishing remain in Python.

This is a deliberate scope decision: no further Rust migration before measurement.
