"""
SecretsScanner — pattern-based secrets detection and redaction.

Uses the ``detect-secrets`` library (Stage 1) and optional custom regex
patterns (Stage 2) to find and replace secret values in log text.

Redaction algorithm mirrors PrivacyFilter: collect (start, end, type) spans
from all lines, then replace from end → start to preserve earlier offsets.

[Source: story-3.3, AC1, AC3, Task 1]
"""
from __future__ import annotations

import re
import time

import structlog
from detect_secrets import settings as ds_settings
from detect_secrets.core.scan import scan_line

from pipeline.privacy_filter import RedactionItem

log = structlog.get_logger()


class SecretsScanner:
    """
    Two-stage secrets redactor.

    Stage 1: ``detect-secrets`` built-in plugins (AWS keys, bearer tokens,
             private key headers, high-entropy strings, etc.)
    Stage 2: Optional caller-supplied custom regex patterns.

    Parameters
    ----------
    (none — stateless; no model to load)
    """

    def scrub(
        self,
        text: str,
        custom_patterns: list[str] | None = None,
    ) -> tuple[str, list[RedactionItem]]:
        """
        Detect secrets in *text* and replace each with a placeholder token.

        Returns a tuple of:
          - redacted_text: text with secret spans replaced
          - redaction_items: list of RedactionItem sorted ascending by start

        Empty text is returned unchanged with an empty list.
        """
        if not text:
            return text, []

        lines = text.splitlines(keepends=True)
        log.info("secrets_scan_start", num_lines=len(lines), text_length=len(text))
        t0 = time.monotonic()
        # List of (start, end, type) spans in the full text
        collected: list[tuple[int, int, str]] = []
        char_offset = 0

        with ds_settings.default_settings() as s:
            # Disable entropy-based plugins: they produce unacceptable false-
            # positive rates on common log words (e.g. "INFO", "server",
            # "started"). Pattern-based detectors provide sufficient coverage
            # for well-known secret formats (AWS keys, GitHub tokens, etc.).
            s.disable_plugins("Base64HighEntropyString", "HexHighEntropyString")
            for line in lines:
                # Stage 1: detect-secrets built-in scanner
                for potential_secret in scan_line(line):
                    value = potential_secret.secret_value
                    if value is None:
                        # Entropy / keyword detectors may not extract a discrete value;
                        # skip — NER pipeline covers keyword-style secrets.
                        continue
                    # Use finditer to catch all occurrences of the secret in the line,
                    # not just the first (line.find would miss duplicates).
                    for m in re.finditer(re.escape(value), line):
                        collected.append((char_offset + m.start(), char_offset + m.end(), "SECRET"))

                # Stage 2: custom regex patterns
                if custom_patterns:
                    for pattern in custom_patterns:
                        for m in re.finditer(pattern, line):
                            collected.append((char_offset + m.start(), char_offset + m.end(), "CUSTOM"))

                char_offset += len(line)

        scan_s = round(time.monotonic() - t0, 3)
        log.info("secrets_scan_done", duration_s=scan_s, raw_matches=len(collected))

        if not collected:
            return text, []

        # Deduplicate overlapping spans and replace from end → start
        sorted_spans = sorted(collected, key=lambda x: x[0], reverse=True)
        items: list[RedactionItem] = []
        used: list[tuple[int, int]] = []

        for start, end, rtype in sorted_spans:
            # Skip if this span overlaps or is fully contained within an already-processed span
            if any(s <= start < e or s < end <= e or (start >= s and end <= e) for s, e in used):
                continue
            placeholder = f"[REDACTED_{rtype}]"
            text = text[:start] + placeholder + text[end:]
            used.append((start, end))
            items.append(
                RedactionItem(
                    entity_type=rtype,
                    start=start,
                    end=end,
                    placeholder=placeholder,
                )
            )

        # Re-sort ascending by original start offset for readability
        items.sort(key=lambda x: x.start)
        return text, items
