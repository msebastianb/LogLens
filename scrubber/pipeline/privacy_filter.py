"""
PrivacyFilter — NER-based PII detection and redaction.

Wraps a `transformers.pipeline("token-classification", ...)` instance loaded
externally (injected at construction time) so the module is independently
testable without loading a real model.

Redaction algorithm:
  1. Run the injected pipeline with aggregation_strategy="first" to get entities
     as a list of dicts with keys: entity_group, score, word, start, end
  2. Sort entities by start offset descending (replace from end → start so
     earlier character offsets remain valid)
  3. Skip any entity whose span overlaps an already-processed span
  4. Replace text[start:end] with [REDACTED_{ENTITY_GROUP}]
  5. Re-sort the redaction summary ascending by start for caller readability

[Source: story-3.2, AC1, Task 1]
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable

import structlog

log = structlog.get_logger()


@dataclass
class RedactionItem:
    """Mirrors the Pydantic model in main.py for internal use."""

    entity_type: str
    start: int
    end: int
    placeholder: str


# Type alias for the callable returned by transformers.pipeline()
NERPipeline = Callable[[str, Any], list[dict]]


class PrivacyFilter:
    """
    NER-based PII redactor.

    Parameters
    ----------
    pipe:
        A loaded ``transformers.pipeline("token-classification", ...)`` instance
        (or any callable with the same signature that returns a list of entity
        dicts with keys ``entity_group``, ``start``, ``end``).
    """

    def __init__(self, pipe: NERPipeline) -> None:
        self._pipe = pipe

    # Maximum characters per chunk sent to the NER model.  Keeps memory
    # usage bounded so the worker doesn't get OOM-killed on large inputs.
    # 5 000 chars ≈ 1 250 tokens — keeps per-chunk latency manageable on CPU.
    _CHUNK_SIZE = 5_000

    def _chunk_text(self, text: str) -> list[tuple[int, str]]:
        """Split *text* into chunks of at most _CHUNK_SIZE chars, on line boundaries.

        Returns a list of (start_offset, chunk_text) tuples.
        """
        chunks: list[tuple[int, str]] = []
        pos = 0
        while pos < len(text):
            end = pos + self._CHUNK_SIZE
            if end >= len(text):
                chunks.append((pos, text[pos:]))
                break
            # Try to split at a newline within the last 500 chars of the chunk
            newline_pos = text.rfind("\n", end - 500, end)
            if newline_pos != -1:
                end = newline_pos + 1  # include the newline in this chunk
            chunks.append((pos, text[pos:end]))
            pos = end
        return chunks

    def scrub(self, text: str) -> tuple[str, list[RedactionItem]]:
        """
        Detect PII entities in *text* and replace each with a placeholder token.

        Returns a tuple of:
          - redacted_text: original text with PII spans replaced
          - redaction_items: list of RedactionItem, sorted ascending by start offset

        Empty text is returned unchanged with an empty redaction list.
        """
        if not text:
            return text, []

        # Process in chunks to avoid OOM on large inputs
        chunks = self._chunk_text(text)
        total_chunks = len(chunks)
        log.info("ner_chunking", text_length=len(text), chunk_size=self._CHUNK_SIZE, num_chunks=total_chunks)

        offsets = [offset for offset, _ in chunks]
        chunk_texts = [chunk for _, chunk in chunks]

        # Batched inference: pass all chunks to the pipeline at once.
        # The pipeline internally batches them (batch_size controls memory
        # vs throughput). This is much faster than sequential per-chunk calls
        # because it amortises model overhead and vectorises tokenisation.
        t_batch = time.monotonic()
        batch_results = self._pipe(
            chunk_texts,
            aggregation_strategy="first",
            batch_size=4,
        )
        batch_elapsed = round(time.monotonic() - t_batch, 3)

        raw_entities: list[dict] = []
        for i, (offset, chunk_entities) in enumerate(zip(offsets, batch_results)):
            for ent in chunk_entities:
                ent["start"] += offset
                ent["end"] += offset
            raw_entities.extend(chunk_entities)
            log.debug(
                "ner_chunk_result",
                chunk=i + 1,
                of=total_chunks,
                chunk_chars=len(chunk_texts[i]),
                entities_found=len(chunk_entities),
            )

        log.info(
            "ner_inference_done",
            total_entities=len(raw_entities),
            num_chunks=total_chunks,
            duration_s=batch_elapsed,
            chars_per_sec=round(len(text) / batch_elapsed) if batch_elapsed > 0 else 0,
        )

        if not raw_entities:
            return text, []

        # Sort descending by start so we replace from the end of the string first,
        # keeping earlier character offsets valid after each substitution.
        sorted_entities = sorted(raw_entities, key=lambda e: e["start"], reverse=True)

        redaction_items: list[RedactionItem] = []
        processed_spans: list[tuple[int, int]] = []

        for ent in sorted_entities:
            start: int = ent["start"]
            end: int = ent["end"]
            group: str = str(ent.get("entity_group", "UNKNOWN")).upper()

            # Skip entity if it overlaps with any already-processed span.
            if any(
                s <= start < e or s < end <= e or (start <= s and end >= e)
                for s, e in processed_spans
            ):
                continue

            placeholder = f"[REDACTED_{group}]"
            text = text[:start] + placeholder + text[end:]
            processed_spans.append((start, end))
            redaction_items.append(
                RedactionItem(
                    entity_type=group,
                    start=start,
                    end=end,
                    placeholder=placeholder,
                )
            )

        # Re-sort summary ascending by original start offset for readability.
        redaction_items.sort(key=lambda x: x.start)

        return text, redaction_items
