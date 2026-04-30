"""
Scrubber service configuration.

Pydantic BaseSettings validates all env vars at import time.
If any required field is missing, Pydantic raises ValidationError and
the process exits non-zero (Uvicorn logs the exception).

[Source: architecture.md#env-var-validation]
"""
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    # NER model for PII detection (HuggingFace model ID).
    # Loaded eagerly at startup via transformers.pipeline().
    # [Source: architecture.md#scrubbing-service]
    NER_MODEL_NAME: str = "openai/privacy-filter"

    # Enable NER-based PII detection.  Disabled by default because the
    # model runs at ~130 chars/sec on CPU — a 500 KB log file would take
    # over an hour.  Only enable when a CUDA-capable GPU is available or
    # the workload is known to be small.
    NER_ENABLED: bool = False

    # ─── Scrubber model config ────────────────────────────────────────
    LOG_LEVEL: str = Field(default="info", pattern="^(trace|debug|info|warn|error)$")

    # ─── Runtime ─────────────────────────────────────────────────────
    # Uvicorn host/port — set here for testability; CLI flags override in production
    HOST: str = "0.0.0.0"
    PORT: int = 8001



# Instantiated at module import — process exits non-zero if required field is missing
settings = Settings()
