from app.agent.graph_doc import DOC_PATH, render


# 그래프 코드와 저장소의 흐름 그림이 같아야 한다 — 다르면 scripts.draw_graph로 다시 만든다
def test_graphDoc_matchesCode() -> None:
    saved = DOC_PATH.read_text(encoding="utf-8").replace("\r\n", "\n")
    assert saved == render(), (
        "그래프가 바뀌었습니다: cd ai-server && uv run python -m scripts.draw_graph"
    )
