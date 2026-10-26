# 0021. AI 조사 흐름을 LangGraph 그래프로 (ai-server)

- **상태:** 제안
- **날짜:** 2026-10-27
- **관련:** Issue #75 (PLAN 2-19d), [ADR-0009](0009-ai-investigation-call-structure.md)
- **영향 받는 담당:** P4 (ai-server)

## 배경

- 처음 기술 방향은 "FastAPI + LangChain · LangGraph로 AI Agent"였는데, 작업을 조각으로 나누면서 PLAN과 ADR에서 빠졌다 (10/27 발견).
- #72에서 AI 조사 흐름(AI에게 묻기 → 증거 조회 창구 부르기 → 형식 검사 → 다시 묻기)을 `while` 문으로 직접 짰다. 흐름이 `if` · `continue` 안에 숨어 있어 읽고 설명하기 어렵다.
- 다음 작업인 2-19b(조사 과정 실시간 표시)는 단계가 끝날 때마다 이벤트가, 2-20(Ollama Qwen 연결)은 제공자별 tool calling 형식 맞추기가 필요하다.

## 결정

- **조사 흐름을 LangGraph `StateGraph`로 표현한다** (`ai-server/app/agent/graph.py`).
  - 노드: `ask_ai`(AI에게 묻기) · `call_tools`(창구 부르기) · `too_many_tools`(너무 많이 부름) · `validate`(형식 검사) · `give_up`(포기)
  - 조건 화살표에는 이름(`창구_요청` · `보고서_작성` · `형식_틀림_다시` · `3번_모두_실패` 등)을 붙여, 그림만 보고도 어떤 상황에 어디로 가는지 읽히게 한다
  - 상태는 조사 한 번 동안 메모리에만 둔다. **체크포인트(대화 저장 · 재시작 후 이어하기)는 쓰지 않는다.** 재시작 처리는 Spring 규칙(ADR-0009 결정 2, #68)이 맡는다
- **동작은 #72와 같다.** 한 시도 창구 최대 8번, 넘으면 한 번 알리고 그래도면 형식 실패, 형식 검사 최대 3번, AI 호출 실패는 바로 끝, Spring 409는 그래프 밖에서 중단. #72 테스트가 그대로 통과하는 것으로 확인한다.
- **AI 호출은 지금처럼 `LlmClient` 경계를 지난다** (AGENTS 6절). 이번에는 그래프만 쓰고, LangChain 모델(`ChatOllama` 등)은 2-20에서 그 경계 안에 넣는다.
- **조사 흐름 그림은 코드에서 뽑는다.** `docs/ai-server/investigation-graph.md`(Mermaid)를 `uv run python -m scripts.draw_graph`로 만들고, 그래프와 그림이 다르면 테스트가 실패한다. 손으로 그린 그림이 낡는 일을 막는다.

## 고려한 대안

| 대안 | 버린 이유 |
| --- | --- |
| 직접 짠 `while` 루프 유지 (#72) | 흐름이 코드에 숨고, 2-19b 단계 이벤트와 2-20 제공자 형식을 따로 짜야 한다. 처음 기술 방향과도 다르다 |
| LangChain `AgentExecutor` · 미리 만든 에이전트 | 형식 검사 후 고쳐 달라고 다시 묻기, 창구 최대 횟수, Spring 409 중단 같은 우리 규칙을 넣기 어렵다. 흐름을 직접 그리는 그래프가 맞다 |
| LangGraph 체크포인트로 조사 상태 저장 | 저장소(DB)가 하나 더 필요하다. 재시작 처리는 이미 Spring이 맡고(#68), 시연 범위에서 이어하기가 필요 없다 |

## 영향

- **ai-server:** 의존성 `langgraph`(버전은 `uv.lock`에 고정), `app/agent/graph.py` · `app/agent/graph_doc.py` · `scripts/draw_graph.py` 추가, `InvestigationService._investigate`가 그래프를 실행
- **API · DB · 화면 · Spring:** 바뀌지 않는다
- **테스트:** #72 테스트 37개 그대로 + 그림 최신 확인 1개

## 검증

`uv run ruff format . && uv run ruff check . && uv run pytest`, 클라우드에서 Spring + ai-server + MariaDB + 화면을 띄워 #72와 같은 보고서 · 조사 과정이 나오는지 확인 (PR 테스트 결과).
