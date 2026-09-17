# Rust rich core POC — acceptance notes

This document tracks the review requirements for PR #50. The PR remains Draft. GitHub Actions is currently unavailable because of the account state, so CI failures with no executed steps are not treated as code failures or passes.

## Realistic payload envelope

The stress target is not only long text. The editor must tolerate RichText that is simultaneously wide and deep:

- up to about 32,000 text characters,
- up to 50 attachment blocks in one rich message,
- a table with up to 50 columns and multiple rows,
- nested inline RichText such as bold/italic/links/custom emoji.

## Correctness and stack safety

### HTML parser parity

`close_frame()` deliberately mirrors `renderer.py::_RichTextHTMLParser.handle_endtag()` for mismatched closing tags: both pop exactly one top frame, discard the mismatched wrapper, and append its children to the parent.

Additional parity hardening now covers cases that the first POC handled incorrectly:

- `>` inside quoted attributes is not treated as the end of a tag,
- unquoted URLs preserve `/` characters,
- ambiguous self-closing syntax, comments/declarations, incomplete tags, and HTML-like text that the native parser cannot model confidently return an error and use the Python fallback,
- legacy semicolonless HTML entities and numeric entity references are conservatively routed to Python so `HTMLParser(convert_charrefs=True)` remains the correctness authority.

The Rust path is intentionally conservative: uncertain syntax loses native acceleration for that input instead of changing the rendered RichText.

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

The marker scanner is also a single streaming pass and no longer builds a `(byte, char)` vector for the entire input. A separate randomized validation compared the same state machine against the Python regex over 50,000 generated brace/newline/Unicode inputs without an offset/order mismatch.

## Allocation changes

The initial POC allocated a `HashMap<String, String>` for every HTML tag. The parser only consumes two attributes (`href` and `emoji-id`), so the POC now uses a fixed `TagAttrs` structure with two optional strings. Attribute names are compared without allocating a lowercase copy.

Further small-vector/hashbrown tuning is intentionally deferred until profiling identifies an allocation hotspot. Adding another dependency without measurements would make the POC more complex without evidence of benefit.

## Python/Rust boundary

Production calls return Python objects directly from PyO3. The previous `serde_json::to_string()` → `json.loads()` route remains exposed only for benchmark/backward comparison.

`py_parse_inline_markers()` still creates an intermediate `serde_json::Value` before converting to Python objects. This is not a JSON-string round trip and is left as a measured optimization opportunity rather than expanding the POC without data.

## Benchmark matrix

The benchmark measures different dimensions instead of only input length:

1. `long_text_32k` — 32K text in one paragraph.
2. `inline_buttons_50_~32k` — 50 valid inline button markers in about 32K text.
3. `wide_table_50x5_short` — 50 columns × 5 rows, short cell text.
4. `wide_attachments_50_short` — 50 attachment blocks with short captions.
5. `combined_table_50x5_~32k` — wide table with about 32K aggregate text.
6. `combined_attachments_50_~32k` — 50 attachments with about 32K aggregate caption text.
7. Direct PyO3-object return vs JSON string + `json.loads()` on a wide/long HTML payload.
8. Python regex/marker parsing vs the Rust single-pass marker scanner.

The benchmark first asserts that native and Python-fallback serialized rich-message output is identical before timing either path. Environment-variable switching is performed outside timed loops so it does not contaminate small measurements.

### Results

No benchmark numbers are recorded yet. GitHub Actions did not execute because of the account state, and the current local execution environment does not contain `cargo`/`rustc`. Numbers must not be invented from an unexecuted benchmark.

Local/CI command once a Rust toolchain is available:

```bash
python benchmarks/rich_core_bench.py --iterations 30
```

## ABI, Cargo and Docker

PyO3 uses `abi3-py312`, so the extension targets the CPython stable ABI with Python 3.12 as its minimum version instead of depending on an exact CPython patch ABI.

`pyo3/extension-module` is an optional default feature. Rust unit tests run with `--no-default-features`, following PyO3's documented workaround for extension-module test-linking failures, while maturin builds the normal extension with the default feature enabled.

The Docker native-builder and runtime both use `python:3.12-slim`. BuildKit cache mounts retain Cargo registry/git data and `rich_core/target` between compatible Docker builds. The runtime image contains only the built wheel, not the Rust toolchain.

`rich_core/Cargo.lock` is not committed yet because a Rust toolchain is not available in the current validation environment to generate it. For reproducible application builds, generating and committing the lockfile is a remaining hardening task before treating the POC as production-final.

## Validation performed without GitHub Actions

Because Actions cannot currently run, the branch received an independent review instead of treating the empty CI job as a signal:

- full PR diff and production renderer-path inspection,
- direct comparison with Python `_RichTextHTMLParser` behavior for malformed/mismatched tags, quoted `>`, unquoted URLs, comments/incomplete tags, and entity edge cases,
- 50,000 randomized marker-boundary comparisons against the Python regex state contract,
- review of PyO3 extension-module test-linking guidance and adjustment of Cargo features,
- review of real table/media serialization paths to confirm width/order tests exercise production code rather than mock helpers,
- benchmark audit to remove environment-mutation noise and add a real 50-marker workload.

This is strong static/behavioral validation, but it is not a substitute for one real Rust compile plus the test and benchmark commands above.

## Explicitly deferred expansion

The Rust POC still accelerates only inline-button scanning/parsing and inline HTML → RichText conversion.

Moving full table validation/serialization or attachment-list construction into Rust is deferred until benchmark data identifies those Python sections as material bottlenecks. Telegram/Aiogram object construction, I/O, FSM, storage, and publishing remain in Python.

This is a deliberate scope decision: no further Rust migration before measurement.
