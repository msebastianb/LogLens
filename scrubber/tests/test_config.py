"""
Unit tests for scrubber/config.py — Pydantic BaseSettings env validation.

[Source: Story 1.1 task 8]
"""
import os
import importlib
import sys

import pytest
from pydantic import ValidationError


def reload_config(env_overrides: dict[str, str]) -> object:
    """
    Helper: patch os.environ, force-reimport config module, restore env.
    Returns the freshly imported config module.
    """
    original = os.environ.copy()
    try:
        os.environ.update(env_overrides)
        # Remove cached module so Pydantic re-reads from os.environ
        sys.modules.pop("config", None)
        return importlib.import_module("config")
    finally:
        os.environ.clear()
        os.environ.update(original)


class TestSettingsDefaults:
    """Settings loads successfully with all defaults when only optional fields are set."""

    def test_default_log_level(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("LOG_LEVEL", raising=False)
        sys.modules.pop("config", None)
        config = importlib.import_module("config")
        assert config.settings.LOG_LEVEL == "info"

    def test_default_port(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("PORT", raising=False)
        sys.modules.pop("config", None)
        config = importlib.import_module("config")
        assert config.settings.PORT == 8001

    def test_default_host(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("HOST", raising=False)
        sys.modules.pop("config", None)
        config = importlib.import_module("config")
        assert config.settings.HOST == "0.0.0.0"


class TestSettingsValidation:
    """Settings raises ValidationError for invalid values."""

    def test_invalid_log_level_raises_validation_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("LOG_LEVEL", "VERBOSE")
        sys.modules.pop("config", None)
        with pytest.raises(ValidationError) as exc_info:
            importlib.import_module("config")
        errors = exc_info.value.errors()
        field_names = [e["loc"][0] for e in errors]
        assert "LOG_LEVEL" in field_names

    def test_invalid_port_type_raises_validation_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("PORT", "not-a-number")
        sys.modules.pop("config", None)
        with pytest.raises(ValidationError) as exc_info:
            importlib.import_module("config")
        errors = exc_info.value.errors()
        field_names = [e["loc"][0] for e in errors]
        assert "PORT" in field_names


class TestSettingsEnvOverrides:
    """Settings correctly picks up env var overrides."""

    def test_custom_log_level(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LOG_LEVEL", "debug")
        sys.modules.pop("config", None)
        config = importlib.import_module("config")
        assert config.settings.LOG_LEVEL == "debug"

    def test_custom_port(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PORT", "9000")
        sys.modules.pop("config", None)
        config = importlib.import_module("config")
        assert config.settings.PORT == 9000
