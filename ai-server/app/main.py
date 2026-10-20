from fastapi import FastAPI

app = FastAPI(title="DonWorry AI Server")


# 살아있는지 확인용 — backend·CI에서 호출
@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
