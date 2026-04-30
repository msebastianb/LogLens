"""
Unit tests for pipeline/privacy_filter.py — PrivacyFilter NER-based redaction.

Fast tests use deterministic fake pipelines (no model loaded).
The recall suite (marked @pytest.mark.slow) loads the real model and requires
network access to download weights on first run.

Run fast tests only:
    pytest scrubber/tests/test_privacy_filter.py -m "not slow"

Run full suite including recall:
    pytest scrubber/tests/test_privacy_filter.py

[Source: story-3.2, AC1, AC3, Task 3]
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from pipeline.privacy_filter import PrivacyFilter, RedactionItem


# ─── helpers ─────────────────────────────────────────────────────────────────

class _FakePipe:
    """Returns a fixed list of entity dicts regardless of input."""

    def __init__(self, entities: list[dict]) -> None:
        self._entities = entities

    def __call__(self, text: str, **kwargs: object) -> list[dict]:
        return self._entities


FIXTURES_DIR = Path(__file__).parent / "fixtures"


# ─── unit tests (mocked pipeline) ────────────────────────────────────────────

class TestPrivacyFilterScrub:
    """PrivacyFilter.scrub() with deterministic fake pipelines."""

    def test_scrub_name_replaced_with_per_placeholder(self) -> None:
        """Person name is replaced with [REDACTED_PRIVATE_PERSON]."""
        entities = [
            {"entity_group": "private_person", "word": "Alice", "start": 10, "end": 15, "score": 0.99}
        ]
        pf = PrivacyFilter(_FakePipe(entities))
        text = "My name: Alice, see you soon."
        redacted, items = pf.scrub(text)

        assert "Alice" not in redacted
        assert "[REDACTED_PRIVATE_PERSON]" in redacted
        assert len(items) == 1
        assert items[0].entity_type == "PRIVATE_PERSON"
        assert items[0].placeholder == "[REDACTED_PRIVATE_PERSON]"
        assert items[0].start == 10
        assert items[0].end == 15

    def test_scrub_email_replaced_with_email_placeholder(self) -> None:
        """Email address is replaced with [REDACTED_PRIVATE_EMAIL]."""
        entities = [
            {
                "entity_group": "private_email",
                "word": "user@example.com",
                "start": 7,
                "end": 23,
                "score": 0.99,
            }
        ]
        pf = PrivacyFilter(_FakePipe(entities))
        text = "Email: user@example.com is on file."
        redacted, items = pf.scrub(text)

        assert "user@example.com" not in redacted
        assert "[REDACTED_PRIVATE_EMAIL]" in redacted
        assert items[0].entity_type == "PRIVATE_EMAIL"

    def test_scrub_phone_replaced_with_phone_placeholder(self) -> None:
        """Phone number is replaced with [REDACTED_PRIVATE_PHONE]."""
        entities = [
            {
                "entity_group": "private_phone",
                "word": "555-123-4567",
                "start": 6,
                "end": 18,
                "score": 0.97,
            }
        ]
        pf = PrivacyFilter(_FakePipe(entities))
        text = "Call: 555-123-4567 for info."
        redacted, items = pf.scrub(text)

        assert "555-123-4567" not in redacted
        assert "[REDACTED_PRIVATE_PHONE]" in redacted
        assert items[0].entity_type == "PRIVATE_PHONE"

    def test_scrub_no_pii_returns_text_unchanged(self) -> None:
        """Text with no detected entities is returned unchanged."""
        pf = PrivacyFilter(_FakePipe([]))
        text = "INFO app started on port 3000."
        redacted, items = pf.scrub(text)

        assert redacted == text
        assert items == []

    def test_scrub_multiple_entities_all_redacted(self) -> None:
        """Multiple non-overlapping entities are all redacted."""
        # Note: entities must be in any order — the implementation sorts them.
        entities = [
            {"entity_group": "private_person", "word": "Bob", "start": 0, "end": 3, "score": 0.99},
            {
                "entity_group": "private_email",
                "word": "bob@test.com",
                "start": 7,
                "end": 19,
                "score": 0.98,
            },
            {
                "entity_group": "private_phone",
                "word": "123-4567",
                "start": 24,
                "end": 32,
                "score": 0.95,
            },
        ]
        pf = PrivacyFilter(_FakePipe(entities))
        text = "Bob at bob@test.com  ph: 123-4567"
        redacted, items = pf.scrub(text)

        assert "Bob" not in redacted
        assert "bob@test.com" not in redacted
        assert "123-4567" not in redacted
        assert "[REDACTED_PRIVATE_PERSON]" in redacted
        assert "[REDACTED_PRIVATE_EMAIL]" in redacted
        assert "[REDACTED_PRIVATE_PHONE]" in redacted
        assert len(items) == 3

    def test_scrub_summary_sorted_ascending_by_start(self) -> None:
        """Redaction summary is sorted ascending by original start offset."""
        entities = [
            {"entity_group": "private_email", "word": "b@b.com", "start": 20, "end": 27, "score": 0.98},
            {"entity_group": "private_person", "word": "Alice", "start": 0, "end": 5, "score": 0.99},
        ]
        pf = PrivacyFilter(_FakePipe(entities))
        _, items = pf.scrub("Alice says hi at b@b.com ok")
        starts = [item.start for item in items]
        assert starts == sorted(starts)

    def test_scrub_overlapping_entities_second_skipped(self) -> None:
        """When two entities overlap, the later-processed (lower start) one is skipped."""
        # Entity at 0-10 and 5-15 overlap; processing descending by start means
        # 5-15 is processed first, then 0-10 overlaps and is skipped.
        entities = [
            {"entity_group": "private_person", "word": "John Smith", "start": 0, "end": 10, "score": 0.99},
            {"entity_group": "UNKNOWN", "word": "Smith Esq", "start": 5, "end": 15, "score": 0.70},
        ]
        pf = PrivacyFilter(_FakePipe(entities))
        _, items = pf.scrub("John Smith Esq is here")
        # Only one should survive — the overlapping one is dropped
        assert len(items) == 1

    def test_scrub_empty_string_returns_empty(self) -> None:
        """Empty string returns unchanged with empty items list."""
        pf = PrivacyFilter(_FakePipe([]))
        redacted, items = pf.scrub("")
        assert redacted == ""
        assert items == []

    def test_scrub_entity_group_uppercased_in_placeholder(self) -> None:
        """entity_group is uppercased in the placeholder regardless of model output case."""
        entities = [
            {"entity_group": "private_person", "word": "Alice", "start": 0, "end": 5, "score": 0.99}
        ]
        pf = PrivacyFilter(_FakePipe(entities))
        redacted, items = pf.scrub("Alice was here.")
        assert "[REDACTED_PRIVATE_PERSON]" in redacted
        assert items[0].entity_type == "PRIVATE_PERSON"

    def test_redaction_item_start_end_are_original_offsets(self) -> None:
        """start/end in RedactionItem reflect original text offsets, not post-redaction offsets."""
        entities = [
            {"entity_group": "PER", "word": "Bob", "start": 5, "end": 8, "score": 0.99}
        ]
        pf = PrivacyFilter(_FakePipe(entities))
        _, items = pf.scrub("Hi, Bob!")
        assert items[0].start == 5
        assert items[0].end == 8


# ─── recall suite (slow — loads real model) ──────────────────────────────────

@pytest.mark.slow
class TestPrivacyFilterRecall:
    """
    Recall suite: load the real model and run against the reference PII corpus.
    Asserts recall ≥ 95% per PII category.

    Recall for category C =
        (entities in category C whose value does NOT appear in redacted output)
        / (total entities in category C)
    """

    @pytest.fixture(scope="class")
    def real_privacy_filter(self) -> PrivacyFilter:
        from transformers import pipeline as hf_pipeline
        from config import settings

        pipe = hf_pipeline(
            "token-classification",
            model=settings.NER_MODEL_NAME,
            device=-1,
            aggregation_strategy="first",
        )
        return PrivacyFilter(pipe)

    def test_recall_per_category_at_least_95_percent(
        self, real_privacy_filter: PrivacyFilter
    ) -> None:
        corpus_path = FIXTURES_DIR / "reference_pii.json"
        corpus: list[dict] = json.loads(corpus_path.read_text())

        # Accumulate: total[category] and missed[category]
        total: dict[str, int] = {}
        missed: dict[str, int] = {}

        for case in corpus:
            original_text: str = case["text"]
            expected_entities: list[dict] = case["entities"]

            if not expected_entities:
                # Clean text — just verify no crash
                real_privacy_filter.scrub(original_text)
                continue

            redacted_text, _ = real_privacy_filter.scrub(original_text)

            for ent in expected_entities:
                cat = ent["category"]
                val = ent["value"]
                total[cat] = total.get(cat, 0) + 1
                # Missed if the original value still appears verbatim in the redacted text
                if val in redacted_text:
                    missed[cat] = missed.get(cat, 0) + 1

        failures: list[str] = []
        for cat, count in total.items():
            miss = missed.get(cat, 0)
            recall = (count - miss) / count
            if recall < 0.95:
                failures.append(
                    f"  {cat}: recall={recall:.2%} ({count - miss}/{count} detected)"
                )

        assert not failures, (
            "Recall < 95% for the following categories:\n" + "\n".join(failures)
        )
