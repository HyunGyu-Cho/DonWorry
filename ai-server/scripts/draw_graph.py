from app.agent.graph_doc import DOC_PATH, render

# 조사 흐름 그림 문서를 다시 만든다 — cd ai-server && uv run python -m scripts.draw_graph
if __name__ == "__main__":
    DOC_PATH.parent.mkdir(parents=True, exist_ok=True)
    DOC_PATH.write_text(render(), encoding="utf-8", newline="\n")
    print(f"그렸습니다: {DOC_PATH}")
