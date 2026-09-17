# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS native-builder

ENV CARGO_HOME=/usr/local/cargo \
    RUSTUP_HOME=/usr/local/rustup \
    PATH=/usr/local/cargo/bin:$PATH \
    PYO3_PYTHON=/usr/local/bin/python3

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain stable
RUN pip install --no-cache-dir maturin==1.9.4

WORKDIR /build
COPY rich_core ./rich_core
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/build/rich_core/target \
    maturin build --release --manifest-path rich_core/Cargo.toml --out /wheels


FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt .
COPY --from=native-builder /wheels /tmp/wheels
RUN pip install --no-cache-dir -r requirements.txt /tmp/wheels/*.whl \
    && rm -rf /tmp/wheels
COPY . .

CMD ["python", "main.py"]
