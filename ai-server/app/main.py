from fastapi import FastAPI

from app.agent.investigator import InvestigationAgent
from app.agent.llm import LlmClient, create_llm_client
from app.agent.tools import StepReporter, ToolRunner
from app.client.spring import (
    ResultNotifier,
    SpringResultNotifier,
    SpringStepReporter,
    SpringToolClient,
)
from app.config import Settings
from app.config import settings as default_settings
from app.controller.investigations import router as investigations_router
from app.service.investigations import InvestigationService


# 설정을 받아 앱을 만든다 — 테스트는 다른 설정(키 · 가짜 AI 실패 횟수)이나 LLM으로 만든다
def create_app(
    settings: Settings = default_settings,
    llm: LlmClient | None = None,
    notifier: ResultNotifier | None = None,
    tools: ToolRunner | None = None,
    reporter: StepReporter | None = None,
) -> FastAPI:
    app = FastAPI(title="DonWorry AI Server")
    agent = InvestigationAgent(llm or create_llm_client(settings))
    if notifier is None and settings.spring_base_url:
        notifier = SpringResultNotifier(settings.spring_base_url, settings.service_key)
    # Spring 주소가 있으면 AI가 증거 조회 창구를 쓰고(#72), 조사 단계를 알린다(2-19b)
    if tools is None and settings.spring_base_url:
        tools = SpringToolClient(settings.spring_base_url, settings.service_key)
    if reporter is None and settings.spring_base_url:
        reporter = SpringStepReporter(settings.spring_base_url, settings.service_key)
    app.state.settings = settings
    app.state.investigation_service = InvestigationService(
        agent,
        settings.max_llm_attempts,
        notifier=notifier,
        tools=tools,
        max_tool_calls=settings.max_tool_calls,
        reporter=reporter,
    )
    app.include_router(investigations_router)

    # 살아있는지 확인용 — backend·CI에서 호출
    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
