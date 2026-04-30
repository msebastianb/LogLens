"""
Unit tests for pipeline/detect_secrets.py — SecretsScanner pattern-based redaction.

Fast tests use the real detect-secrets scanner (no ML model — instantaneous).
The recall suite (marked @pytest.mark.slow) loads the full reference corpus.

Run fast tests only:
    pytest scrubber/tests/test_detect_secrets.py -m "not slow"

Run full suite including recall:
    pytest scrubber/tests/test_detect_secrets.py

[Source: story-3.3, AC1, AC2, AC3, Task 4]
"""
from __future__ import annotations

from pathlib import Path

import pytest

from pipeline.detect_secrets import SecretsScanner

FIXTURES_DIR = Path(__file__).parent.parent.parent / "e2e" / "fixtures"


class TestSecretsScanner:
    """SecretsScanner.scrub() — fast tests using real detect-secrets scanner."""

    def test_aws_access_key_redacted(self) -> None:
        """AWS access key format is detected and replaced with [REDACTED_SECRET]."""
        ss = SecretsScanner()
        text = "AKIAIOSFODNN7EXAMPLE"
        redacted, items = ss.scrub(text)

        assert "AKIAIOSFODNN7EXAMPLE" not in redacted
        assert "[REDACTED_SECRET]" in redacted
        assert any(item.entity_type == "SECRET" for item in items)

    def test_bearer_token_redacted(self) -> None:
        """Bearer token containing an AWS key is detected and redacted."""
        ss = SecretsScanner()
        text = "Authorization: Bearer AKIAIOSFODNN7EXAMPLE"
        redacted, items = ss.scrub(text)

        assert "AKIAIOSFODNN7EXAMPLE" not in redacted
        assert any(item.entity_type == "SECRET" for item in items)

    def test_no_secrets_unchanged(self) -> None:
        """Log line with no secrets returns text unchanged and empty list."""
        ss = SecretsScanner()
        text = "INFO server started on port 3000"
        redacted, items = ss.scrub(text)

        assert redacted == text
        assert items == []

    def test_empty_text_unchanged(self) -> None:
        """Empty string returns empty string and empty list without error."""
        ss = SecretsScanner()
        redacted, items = ss.scrub("")
        assert redacted == ""
        assert items == []

    def test_custom_pattern_match_redacted(self) -> None:
        """Custom regex pattern matches and replaces with [REDACTED_CUSTOM]."""
        ss = SecretsScanner()
        text = "task PROJ-1234 failed"
        redacted, items = ss.scrub(text, custom_patterns=["PROJ-[0-9]+"])

        assert "PROJ-1234" not in redacted
        assert "[REDACTED_CUSTOM]" in redacted
        assert len(items) == 1
        assert items[0].entity_type == "CUSTOM"
        assert items[0].placeholder == "[REDACTED_CUSTOM]"

    def test_custom_pattern_empty_list_noop(self) -> None:
        """Empty custom_patterns list: no error, text returned unchanged."""
        ss = SecretsScanner()
        text = "INFO server started"
        redacted, items = ss.scrub(text, custom_patterns=[])
        assert redacted == text
        assert items == []

    def test_custom_pattern_none_noop(self) -> None:
        """custom_patterns=None (default): no error, clean text unchanged."""
        ss = SecretsScanner()
        text = "INFO server started"
        redacted, items = ss.scrub(text, custom_patterns=None)
        assert redacted == text
        assert items == []

    def test_custom_and_secret_both_redacted(self) -> None:
        """Text with both AWS key and custom pattern: both replaced correctly."""
        ss = SecretsScanner()
        # Line has an AWS key AND a custom project code on the same line
        text = "AKIAIOSFODNN7EXAMPLE job=PROJ-9999"
        redacted, items = ss.scrub(text, custom_patterns=["PROJ-[0-9]+"])

        assert "AKIAIOSFODNN7EXAMPLE" not in redacted
        assert "PROJ-9999" not in redacted
        assert "[REDACTED_SECRET]" in redacted
        assert "[REDACTED_CUSTOM]" in redacted

        types = {item.entity_type for item in items}
        assert "SECRET" in types
        assert "CUSTOM" in types

    def test_redaction_items_sorted_ascending(self) -> None:
        """redaction_items are sorted by start offset ascending."""
        ss = SecretsScanner()
        # Two custom patterns on same line at known offsets
        text = "alpha PROJ-1 beta PROJ-2"
        _, items = ss.scrub(text, custom_patterns=["PROJ-[0-9]+"])
        starts = [item.start for item in items]
        assert starts == sorted(starts)

    def test_placeholder_format_secret(self) -> None:
        """SECRET entity uses exactly [REDACTED_SECRET] placeholder."""
        ss = SecretsScanner()
        _, items = ss.scrub("AKIAIOSFODNN7EXAMPLE")
        secret_items = [i for i in items if i.entity_type == "SECRET"]
        assert secret_items
        assert all(i.placeholder == "[REDACTED_SECRET]" for i in secret_items)

    def test_stripe_key_redacted(self) -> None:
        """Stripe live key is detected and redacted."""
        ss = SecretsScanner()
        text = "sk_test_not_a_real_key_value"
        redacted, items = ss.scrub(text)
        assert "sk_test_not_a_real_key_value" not in redacted
        assert any(i.entity_type == "SECRET" for i in items)

    def test_multiple_occurrences_of_same_secret_all_redacted(self) -> None:
        """Same secret appearing twice on one line: both occurrences are replaced."""
        ss = SecretsScanner()
        key = "AKIAIOSFODNN7EXAMPLE"
        text = f"{key} and again {key}"
        redacted, items = ss.scrub(text)

        assert key not in redacted
        assert redacted.count("[REDACTED_SECRET]") == 2
        assert len([i for i in items if i.entity_type == "SECRET"]) == 2

    def test_invalid_custom_pattern_raises_value_error(self) -> None:
        """Malformed regex in custom_patterns raises ValueError (→ 422 at API layer)."""
        import re

        ss = SecretsScanner()
        with pytest.raises(re.error):
            ss.scrub("some text", custom_patterns=["["])  # unclosed bracket


class TestSecretsScannerRecallSuite:
    """100% recall suite — verifies every entry in the reference corpus is detected."""

    @pytest.mark.slow
    def test_recall_suite_100_percent(self) -> None:
        """Every line in reference-secrets.txt must have at least one redaction."""
        corpus_path = FIXTURES_DIR / "reference-secrets.txt"
        assert corpus_path.exists(), f"Corpus missing: {corpus_path}"

        ss = SecretsScanner()
        lines = [line.rstrip("\n") for line in corpus_path.read_text().splitlines() if line.strip()]
        assert lines, "Corpus is empty"

        missed: list[str] = []
        for line in lines:
            _, items = ss.scrub(line)
            if not items:
                missed.append(line)

        assert not missed, (
            f"100% recall failed — {len(missed)}/{len(lines)} corpus entries not detected:\n"
            + "\n".join(f"  {l!r}" for l in missed)
        )
