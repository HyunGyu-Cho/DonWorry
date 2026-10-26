from pydantic_settings import BaseSettings, SettingsConfigDict


# .env 또는 환경변수에서 읽는다 (접두사 AI_SERVER_)
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="AI_SERVER_")

    llm_provider: str = "mock"
    llm_api_key: str = ""

    # Spring ↔ ai-server 서비스 간 키 (X-Service-Key). 비어 있으면 조사 API를 모두 막는다
    service_key: str = ""

    # 한 번의 시도 안에서 AI 답이 형식 검사에 떨어졌을 때 다시 묻는 최대 횟수 (첫 질문 포함)
    max_llm_attempts: int = 3

    # 가짜 AI가 처음 N번은 형식이 틀린 답을 낸다 — 시연 · 테스트에서 "1차 실패 → 다시 시도" 재현
    mock_invalid_answers: int = 0

    # 가짜 AI가 한 번 답하는 데 걸리는 시간(초) — 시연에서 조사 과정이 보이게
    mock_delay_seconds: float = 0.0


settings = Settings()
