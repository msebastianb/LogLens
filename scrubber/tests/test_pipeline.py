"""
Integration tests for the FastAPI scrubber pipeline.

Fast tests (no real model): override app.state.privacy_filter with a mock after
TestClient startup, so the real model is never loaded.

Slow tests (real model, marked @pytest.mark.slow): use the real PrivacyFilter
loaded during lifespan startup.

Run fast tests only:
    pytest scrubber/tests/test_pipeline.py -m "not slow"

Run full suite including real-model tests:
    pytest scrubber/tests/test_pipeline.py

[Source: story-3.2, AC2, Task 4]
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from pipeline.privacy_filter import PrivacyFilter


# ─── helpers ─────────────────────────────────────────────────────────────────

class _FakePipe:
    def __init__(self, entities: list[dict]) -> None:
        self._entities = entities

    def __call__(self, text: str, **kwargs: object) -> list[dict]:
        return self._entities


def _make_mock_pf(entities: list[dict]) -> PrivacyFilter:
    return PrivacyFilter(_FakePipe(entities))


# ─── fast integration tests (mocked model) ───────────────────────────────────

class TestScrubEndpointFast:
    """Route-level tests with app.state.privacy_filter overridden — no real model."""

    def test_post_scrub_single_entity_redacted(self) -> None:
        """/scrub returns redacted_text and non-empty redaction_summary."""
        entities = [
            {"entity_group": "private_person", "word": "Alice", "start": 10, "end": 15, "score": 0.99}
        ]
        with TestClient(app) as client:
            app.state.privacy_filter = _make_mock_pf(entities)
            response = client.post("/scrub", json={"text": "My name: Alice here."})

        assert response.status_code == 200
        body = response.json()
        assert "Alice" not in body["redacted_text"]
        assert "[REDACTED_PRIVATE_PERSON]" in body["redacted_text"]
        assert len(body["redaction_summary"]) == 1
        item = body["redaction_summary"][0]
        assert item["entity_type"] == "PRIVATE_PERSON"
        assert item["placeholder"] == "[REDACTED_PRIVATE_PERSON]"
        assert item["start"] == 10
        assert item["end"] == 15

    def test_post_scrub_multi_entity_response(self) -> None:
        """Multi-entity text: redaction_summary lists all categories correctly."""
        entities = [
            {"entity_group": "private_person", "word": "John Smith", "start": 0, "end": 10, "score": 0.99},
            {
                "entity_group": "private_phone",
                "word": "555-123-4567",
                "start": 18,
                "end": 30,
                "score": 0.97,
            },
        ]
        with TestClient(app) as client:
            app.state.privacy_filter = _make_mock_pf(entities)
            response = client.post(
                "/scrub", json={"text": "John Smith called 555-123-4567 today."}
            )

        assert response.status_code == 200
        body = response.json()
        assert "John Smith" not in body["redacted_text"]
        assert "555-123-4567" not in body["redacted_text"]
        categories = {item["entity_type"] for item in body["redaction_summary"]}
        assert categories == {"PRIVATE_PERSON", "PRIVATE_PHONE"}

    def test_post_scrub_no_pii_returns_unchanged_text(self) -> None:
        """Text with no PII: redacted_text equals original, empty summary."""
        with TestClient(app) as client:
            app.state.privacy_filter = _make_mock_pf([])
            response = client.post("/scrub", json={"text": "INFO server started on port 3000."})

        assert response.status_code == 200
        body = response.json()
        assert body["redacted_text"] == "INFO server started on port 3000."
        assert body["redaction_summary"] == []

    def test_post_scrub_empty_text(self) -> None:
        """Empty text returns empty redacted_text and empty summary without error."""
        with TestClient(app) as client:
            app.state.privacy_filter = _make_mock_pf([])
            response = client.post("/scrub", json={"text": ""})

        assert response.status_code == 200
        body = response.json()
        assert body["redacted_text"] == ""
        assert body["redaction_summary"] == []

    def test_post_scrub_response_schema_matches_contract(self) -> None:
        """Response fields match the contract expected by scrubService.ts."""
        entities = [
            {"entity_group": "private_email", "word": "a@b.com", "start": 0, "end": 7, "score": 0.98}
        ]
        with TestClient(app) as client:
            app.state.privacy_filter = _make_mock_pf(entities)
            response = client.post("/scrub", json={"text": "a@b.com is the address."})

        body = response.json()
        # Top-level keys (snake_case contract)
        assert "redacted_text" in body
        assert "redaction_summary" in body
        # Per-item keys
        item = body["redaction_summary"][0]
        for key in ("entity_type", "start", "end", "placeholder"):
            assert key in item, f"Missing key: {key}"


class TestAppStateIntegration:
    """Verify model loading and app.state wiring."""

    def test_privacy_filter_loaded_in_app_state_after_startup(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """After lifespan startup, app.state.privacy_filter is a PrivacyFilter instance."""
        # Patch hf_pipeline so the real model is not downloaded
        monkeypatch.setattr(
            "main.hf_pipeline",
            lambda *args, **kwargs: _FakePipe([]),
        )
        with TestClient(app) as client:
            pf = app.state.privacy_filter
        assert pf is not None
        assert isinstance(pf, PrivacyFilter)


# ─── slow integration tests (real model) ─────────────────────────────────────

@pytest.mark.slow
class TestScrubEndpointRealModel:
    """Integration tests with the real NER model. Require model weights to be available."""

    def test_first_request_completes_without_cold_start(self, client: TestClient) -> None:
        """After startup the first /scrub request completes within 5 seconds (NFR7)."""
        import time

        start = time.monotonic()
        response = client.post("/scrub", json={"text": "Contact John at john@test.com."})
        elapsed = time.monotonic() - start

        assert response.status_code == 200
        assert elapsed < 5.0, f"First request took {elapsed:.2f}s — cold-start occurred"

    def test_model_loaded_in_app_state(self, client: TestClient) -> None:
        """Real model is a PrivacyFilter instance on app.state after lifespan."""
        assert isinstance(app.state.privacy_filter, PrivacyFilter)


# ─── Story 3.3: secrets + custom pattern integration tests ───────────────────

class TestScrubEndpointSecrets:
    """
    Integration tests for the two-stage pipeline (PrivacyFilter + SecretsScanner).

    PrivacyFilter is mocked to pass text through unchanged so we can isolate
    SecretsScanner behaviour.  SecretsScanner uses the real detect-secrets
    library (no ML model — instantaneous startup).
    """

    def test_post_scrub_with_secret_detected(self) -> None:
        """AWS key in text is redacted by SecretsScanner; redaction_summary has SECRET entry."""
        with TestClient(app) as client:
            # Mock PF to pass text through unchanged
            app.state.privacy_filter = _make_mock_pf([])
            response = client.post("/scrub", json={"text": "AKIAIOSFODNN7EXAMPLE"})

        assert response.status_code == 200
        body = response.json()
        assert "AKIAIOSFODNN7EXAMPLE" not in body["redacted_text"]
        assert "[REDACTED_SECRET]" in body["redacted_text"]
        types = {item["entity_type"] for item in body["redaction_summary"]}
        assert "SECRET" in types

    def test_post_scrub_with_custom_pattern(self) -> None:
        """Custom pattern PROJ-[0-9]+ redacts matching token; entity_type is CUSTOM."""
        with TestClient(app) as client:
            app.state.privacy_filter = _make_mock_pf([])
            response = client.post(
                "/scrub",
                json={"text": "Failed job PROJ-9999", "custom_patterns": ["PROJ-[0-9]+"]},
            )

        assert response.status_code == 200
        body = response.json()
        assert "PROJ-9999" not in body["redacted_text"]
        assert "[REDACTED_CUSTOM]" in body["redacted_text"]
        custom_items = [i for i in body["redaction_summary"] if i["entity_type"] == "CUSTOM"]
        assert custom_items

    def test_post_scrub_custom_patterns_empty_list(self) -> None:
        """Empty custom_patterns list: clean text unchanged, no error."""
        with TestClient(app) as client:
            app.state.privacy_filter = _make_mock_pf([])
            response = client.post(
                "/scrub",
                json={"text": "INFO server started", "custom_patterns": []},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["redacted_text"] == "INFO server started"
        assert body["redaction_summary"] == []

    def test_post_scrub_pii_and_secret_both_redacted(self) -> None:
        """When PF detects PII and SS detects a secret, both appear in redaction_summary."""
        pf_entities = [
            {
                "entity_group": "private_person",
                "word": "Alice",
                "start": 0,
                "end": 5,
                "score": 0.99,
            }
        ]
        # Text: "Alice AKIAIOSFODNN7EXAMPLE" — PF handles "Alice", SS handles AWS key
        with TestClient(app) as client:
            app.state.privacy_filter = _make_mock_pf(pf_entities)
            response = client.post(
                "/scrub",
                json={"text": "Alice AKIAIOSFODNN7EXAMPLE"},
            )

        assert response.status_code == 200
        body = response.json()
        assert "Alice" not in body["redacted_text"]
        assert "AKIAIOSFODNN7EXAMPLE" not in body["redacted_text"]
        types = {item["entity_type"] for item in body["redaction_summary"]}
        assert "PRIVATE_PERSON" in types
        assert "SECRET" in types

    def test_invalid_custom_pattern_returns_422(self) -> None:
        """Malformed regex in custom_patterns → 422 Unprocessable Entity."""
        with TestClient(app) as client:
            app.state.privacy_filter = _make_mock_pf([])
            response = client.post(
                "/scrub",
                json={"text": "some log line", "custom_patterns": ["["]},
            )

        assert response.status_code == 422
