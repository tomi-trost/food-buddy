from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class VisionProviderConfig(BaseModel):
    """One OpenAI-compatible endpoint (Ollama, llama.cpp server, vLLM, ...)."""

    name: str
    url: str
    model: str
    timeout_s: float = 300.0


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://food:food@localhost:5433/food"
    jwt_secret: str = Field(default="dev-only-secret-change-me-in-production", min_length=32)
    access_token_minutes: int = 60 * 24 * 7
    photo_dir: Path = Path("data/photos")
    max_upload_mb: int = 15
    photo_max_px: int = 1280

    # Tried in order; set as JSON, e.g.
    # VISION_PROVIDERS='[{"name":"local","url":"http://ollama:11434/v1","model":"qwen3-vl:4b-instruct"}]'
    vision_providers: list[VisionProviderConfig] = [
        VisionProviderConfig(
            name="local", url="http://localhost:11434/v1", model="qwen3-vl:4b-instruct"
        )
    ]

    @property
    def psycopg_conninfo(self) -> str:
        """Plain libpq URL for Procrastinate (no SQLAlchemy driver suffix)."""
        return self.database_url.replace("postgresql+psycopg://", "postgresql://", 1)


@lru_cache
def get_settings() -> Settings:
    return Settings()
