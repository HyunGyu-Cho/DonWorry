import os

import pytest


# 테스트가 실행한 창의 환경 변수(AI_SERVER_*)를 읽지 않게 한다
# 시연하려고 넣어 둔 Spring 주소 · 가짜 AI 실패 횟수가 남아 있으면 결과가 달라진다 (#72에서 발견)
@pytest.fixture(autouse=True)
def isolate_settings_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in list(os.environ):
        if name.upper().startswith("AI_SERVER_"):
            monkeypatch.delenv(name)
