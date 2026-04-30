"""
Shared pytest fixtures for scrubber tests.

[Source: story-3.2, Task 4]
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from main import app
from pipeline.privacy_filter import PrivacyFilter


class _FakePipe:
    """Deterministic fake NER pipeline for unit/integration tests.

    Constructed with a fixed list of entity dicts; always returns that list
    regardless of the input text.
    """

    def __init__(self, entities: list[dict]) -> None:
        self._entities = entities

    def __call__(self, text: str, **kwargs: object) -> list[dict]:
        return self._entities


@pytest.fixture()
def client() -> TestClient:  # type: ignore[return]
    """
    Full TestClient context — triggers lifespan startup/shutdown.

    Use this for integration tests that need a fully initialised app,
    including the real NER model (slow tests) or with app.state overridden
    (fast route-level tests).
    """
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def mock_pf_name_email() -> PrivacyFilter:
    """
    PrivacyFilter backed by a deterministic fake pipe that detects:
      - 'John' at offset 11..15 as private_person
      - 'john@example.com' at offset 17..33 as private_email
    for the text 'My name is John, john@example.com'.
    """
    entities = [
        {"entity_group": "private_person", "word": "John", "start": 11, "end": 15, "score": 0.99},
        {
            "entity_group": "private_email",
            "word": "john@example.com",
            "start": 17,
            "end": 33,
            "score": 0.98,
        },
    ]
    return PrivacyFilter(_FakePipe(entities))


@pytest.fixture()
def mock_pf_phone() -> PrivacyFilter:
    """PrivacyFilter that detects a single private_phone entity."""
    entities = [
        {
            "entity_group": "private_phone",
            "word": "555-123-4567",
            "start": 10,
            "end": 22,
            "score": 0.97,
        }
    ]
    return PrivacyFilter(_FakePipe(entities))


@pytest.fixture()
def mock_pf_empty() -> PrivacyFilter:
    """PrivacyFilter that finds no entities (clean text)."""
    return PrivacyFilter(_FakePipe([]))
