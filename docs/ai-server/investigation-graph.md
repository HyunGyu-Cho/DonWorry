# AI 조사 흐름 (LangGraph)

> 이 문서는 `ai-server/app/agent/graph.py`에서 자동으로 만든다. 그래프를 바꿨으면
> `cd ai-server && uv run python -m scripts.draw_graph`로 다시 만든다 (테스트가 차이를 잡는다).

AI가 사건 하나를 조사하는 순서다.
네모는 할 일(노드), 실선은 늘 가는 길, 점선은 상황에 따라 고르는 길이다.

- `ask_ai` — AI에게 묻는다. AI는 증거 조회 창구를 더 부르거나, 보고서를 쓴다
- `call_tools` — AI가 고른 창구를 Spring에 부르고 결과를 대화에 붙인다 (한 시도 최대 8번)
- AI가 `finish_evidence`(증거 수집 끝)를 부르면 Spring에 묻지 않고,
  다음 질문부터 창구 없이 보고서 모양을 고정한다
- `too_many_tools` — 창구를 너무 많이 부르면 한 번 알리고, 그래도 부르면 형식이 틀린 답으로 센다
- `validate` — 보고서 형식을 검사한다. 틀리면 고쳐 달라고 다시 묻는다
- `ground` — 근거를 검사한다: 출처 · 금액 · 배수 · 건수 · 결제 번호가 받은 증거에 있는지
  통과하면 끝, 아니면 틀린 곳을 짚어 다시 묻는다 (창구 없이 조사했으면 건너뜀)
- 형식 · 근거 다시 묻기는 합쳐서 최대 3번. 다시 물을 때도 창구 없이 보고서 모양을 고정한다
- `give_up` — 3번 모두 검사를 통과하지 못하면 실패로 끝낸다 (직원이 다시 조사 · 직접 판정)
- AI 호출 자체가 실패하면 `ask_ai`에서 바로 끝난다
- Spring이 "현재 시도 아님"이라고 하면 그래프 밖에서 조사를 멈춘다

```mermaid
---
config:
  flowchart:
    curve: linear
---
graph TD;
	__start__([<p>__start__</p>]):::first
	ask_ai(ask_ai)
	call_tools(call_tools)
	too_many_tools(too_many_tools)
	validate(validate)
	ground(ground)
	give_up(give_up)
	__end__([<p>__end__</p>]):::last
	__start__ --> ask_ai;
	ask_ai -. &nbsp;AI_호출_실패&nbsp; .-> __end__;
	ask_ai -. &nbsp;창구_요청&nbsp; .-> call_tools;
	ask_ai -. &nbsp;창구_너무_많음&nbsp; .-> too_many_tools;
	ask_ai -. &nbsp;보고서_작성&nbsp; .-> validate;
	call_tools --> ask_ai;
	ground -. &nbsp;통과&nbsp; .-> __end__;
	ground -. &nbsp;근거_부족_다시&nbsp; .-> ask_ai;
	ground -. &nbsp;3번_모두_실패&nbsp; .-> give_up;
	too_many_tools -. &nbsp;다시_묻기&nbsp; .-> ask_ai;
	too_many_tools -. &nbsp;3번_모두_실패&nbsp; .-> give_up;
	validate -. &nbsp;형식_틀림_다시&nbsp; .-> ask_ai;
	validate -. &nbsp;3번_모두_실패&nbsp; .-> give_up;
	validate -. &nbsp;형식_통과&nbsp; .-> ground;
	give_up --> __end__;
	classDef default fill:#f2f0ff,line-height:1.2
	classDef first fill-opacity:0
	classDef last fill:#bfb6fc
```
