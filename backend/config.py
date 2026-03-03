import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # LLM
    openai_api_key: str
    openai_model: str = "gpt-4o"
    openai_embedding_model: str = "text-embedding-3-small"

    # Database
    database_url: str
    readonly_database_url: str = ""  # falls back to database_url if not set

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # LangSmith
    langchain_api_key: str = ""
    langchain_tracing_v2: str = "true"
    langchain_project: str = "revagent-development"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Slack
    slack_bot_token: str = ""
    slack_signing_secret: str = ""
    slack_channel_id: str = ""

    # Discord
    discord_webhook_url: str = ""        # outbound alerts (no bot required)
    discord_bot_token: str = ""          # inbound slash commands
    discord_public_key: str = ""         # Ed25519 signature verification
    discord_guild_id: str = ""           # guild for registering slash commands
    discord_channel_id: str = ""         # default alert channel

    # SendGrid
    sendgrid_api_key: str = ""
    sendgrid_from_email: str = "noreply@revagent.io"
    alert_email: str = ""

    # Auth
    secret_key: str = "change-this-in-production"
    access_token_expire_minutes: int = 60

    # App
    allowed_origins: str = "http://localhost:3000"
    environment: str = "development"

    # Demo mode
    demo_mode: bool = False

    @property
    def db_url_readonly(self) -> str:
        return self.readonly_database_url or self.database_url

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    def configure_langsmith(self):
        os.environ["LANGCHAIN_TRACING_V2"] = self.langchain_tracing_v2
        os.environ["LANGCHAIN_PROJECT"] = self.langchain_project
        if self.langchain_api_key:
            os.environ["LANGCHAIN_API_KEY"] = self.langchain_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
# Apply LangSmith env vars immediately on import
settings.configure_langsmith()
