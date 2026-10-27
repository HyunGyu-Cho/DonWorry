import os

from pydantic_settings import BaseSettings, SettingsConfigDict


# .env 또는 환경변수에서 읽는다 (접두사 AI_SERVER_)
class Settings(BaseSettings):
    # 내 PC 설정 ai-server/.env (git 제외, 예시 .env.example). 테스트는 읽지 않는다 (conftest, #84)
    model_config = SettingsConfigDict(
        env_file=os.environ.get("AI_SERVER_ENV_FILE", ".env") or None, env_prefix="AI_SERVER_"
    )

    # mock = 가짜 AI(테스트 · CI), ollama = 내 PC의 Qwen, openai = OpenAI (#88)
    llm_provider: str = "mock"
    # openai만 필요. 저장소 · 로그에 남기지 않고 .env에 직접 넣는다
    llm_api_key: str = ""
    llm_model: str = "qwen2.5:7b"
    # 비우면 제공자별 기본 주소 (ollama = 127.0.0.1:11434)
    llm_base_url: str = ""
    # AI 한 번 답하는 데 기다리는 시간(초). CPU로 돌리는 7b 모델은 1분 넘게 걸릴 수 있다
    llm_timeout_seconds: float = 180.0

    # Spring ↔ ai-server 서비스 간 키 (X-Service-Key). 비어 있으면 조사 API를 모두 막는다
    # 결과를 Spring에 보낼 때도 같은 키를 쓴다 (2-17)
    service_key: str = ""

    # 조사 결과를 보낼 Spring 주소. 비어 있으면 보내지 않고 조회(GET /investigations/{id})로만 확인
    spring_base_url: str = ""

    # 한 번의 시도 안에서 AI 답이 형식 검사에 떨어졌을 때 다시 묻는 최대 횟수 (첫 질문 포함)
    max_llm_attempts: int = 3

    # 한 시도에서 AI가 부를 수 있는 증거 조회 창구 수 (넘으면 한 번 알리고, 그래도면 형식 실패, #72)
    max_tool_calls: int = 8

    # 가짜 AI가 처음 N번은 형식이 틀린 답을 낸다 — 시연 · 테스트에서 "1차 실패 → 다시 시도" 재현
    mock_invalid_answers: int = 0

    # 가짜 AI가 한 번 답하는 데 걸리는 시간(초) — 시연에서 조사 과정이 보이게
    mock_delay_seconds: float = 0.0


settings = Settings()
