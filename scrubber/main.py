"""
LogLens Scrubber service.

Story 1.1 — health check + POST /scrub skeleton.
Story 3.2 — NER-based PII detection via PrivacyFilter (model loaded eagerly at startup).

[Source: architecture.md#scrubbing-service]
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator
import asyncio

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import re as _re

from pydantic import BaseModel, field_validator
from transformers import pipeline as hf_pipeline

from config import settings
from pipeline.detect_secrets import SecretsScanner
from pipeline.privacy_filter import PrivacyFilter

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler — startup/shutdown hooks."""
    log.info(
        "loglens_scrubber_starting",
        log_level=settings.LOG_LEVEL,
        host=settings.HOST,
        port=settings.PORT,
    )
    # Story 3.2: load NER model eagerly so no cold-start on first request (NFR7)
    if settings.NER_ENABLED:
        log.info("loading_ner_model", model=settings.NER_MODEL_NAME)
        app.state.privacy_filter = PrivacyFilter(
            hf_pipeline(
                "token-classification",
                model=settings.NER_MODEL_NAME,
                device=-1,
                aggregation_strategy="first",
            )
        )
        log.info("ner_model_loaded", model=settings.NER_MODEL_NAME)
    else:
        app.state.privacy_filter = None
        log.info("ner_model_skipped", reason="NER_ENABLED=false")
    # Story 3.3: stateless secrets scanner (no model to load)
    app.state.secrets_scanner = SecretsScanner()
    log.info("secrets_scanner_loaded")
    yield
    log.info("loglens_scrubber_shutdown")


app = FastAPI(
    title="LogLens Scrubber",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)


class ScrubRequest(BaseModel):
    text: str
    custom_patterns: list[str] | None = None

    @field_validator("custom_patterns")
    @classmethod
    def validate_custom_patterns(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        for pattern in v:
            try:
                _re.compile(pattern)
            except _re.error as exc:
                raise ValueError(f"Invalid regex pattern {pattern!r}: {exc}") from exc
        return v


class RedactionItem(BaseModel):
    entity_type: str
    start: int
    end: int
    placeholder: str


class ScrubResponse(BaseModel):
    redacted_text: str
    redaction_summary: list[RedactionItem]


@app.post("/scrub", response_model=ScrubResponse)
async def scrub(request: Request, body: ScrubRequest) -> ScrubResponse:
    """Scrub PII and secrets from log text using two-stage pipeline."""
    import time

    text_len = len(body.text)
    log.info("scrub_request_received", text_length=text_len)
    t0 = time.monotonic()

    pf: PrivacyFilter | None = request.app.state.privacy_filter
    ss: SecretsScanner = request.app.state.secrets_scanner

    # Stage 1: NER-based PII redaction (CPU-bound — run in thread pool to avoid blocking event loop)
    if pf is not None:
        t1 = time.monotonic()
        pf_text, pf_items = await asyncio.to_thread(pf.scrub, body.text)
        t2 = time.monotonic()
        log.info(
            "stage1_ner_complete",
            duration_s=round(t2 - t1, 3),
            redactions=len(pf_items),
            text_length=text_len,
        )
    else:
        pf_text = body.text
        pf_items = []
        log.info("stage1_ner_skipped", text_length=text_len)

    # Stage 2: secrets + custom patterns (run on already-NER-redacted text)
    t3 = time.monotonic()
    ss_text, ss_items = await asyncio.to_thread(ss.scrub, pf_text, body.custom_patterns)
    t4 = time.monotonic()
    log.info(
        "stage2_secrets_complete",
        duration_s=round(t4 - t3, 3),
        redactions=len(ss_items),
        custom_patterns=len(body.custom_patterns) if body.custom_patterns else 0,
    )

    all_items = pf_items + ss_items
    total_s = round(time.monotonic() - t0, 3)
    log.info(
        "scrub_complete",
        total_duration_s=total_s,
        total_redactions=len(all_items),
        text_length=text_len,
        chars_per_sec=round(text_len / total_s) if total_s > 0 else 0,
    )

    return ScrubResponse(
        redacted_text=ss_text,
        redaction_summary=[
            RedactionItem(
                entity_type=item.entity_type,
                start=item.start,
                end=item.end,
                placeholder=item.placeholder,
            )
            for item in all_items
        ],
    )


@app.get("/health")
async def health() -> JSONResponse:
    """Liveness probe."""
    return JSONResponse(content={"status": "ok"})
