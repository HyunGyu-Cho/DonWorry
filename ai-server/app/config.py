from pydantic_settings import BaseSettings, SettingsConfigDict


# .env 또는 환경변수에서 읽는다 (접두사 AI_SERVER_)
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="AI_SERVER_")

    llm_provider: str = "mock"
    llm_api_key: str = ""


settings = Settings()
