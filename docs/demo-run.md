# 시연 켜는 법 (처음 켜는 사람용)

돈워리 시연은 서버 3개를 켭니다: **백엔드(Spring) · AI 서버(ai-server) · 화면(frontend)**.
설정은 폴더마다 `.env` 파일 하나에 둡니다. 창마다 환경 변수를 칠 필요가 없습니다 (#84).

## 0. 준비

- MariaDB가 3307에서 돌고 있어야 합니다 (README 2절). 개인용 DB 이름을 쓰면 1번에서 `DONWORRY_DB_NAME`을 바꿉니다
- `uv` · `node`가 설치돼 있어야 합니다 (README 사전 준비)

## 1. 설정 파일 만들기 (처음 한 번)

예시 파일을 복사합니다. `.env`는 git에 올라가지 않습니다.

```powershell
copy backend\.env.example backend\.env
copy ai-server\.env.example ai-server\.env
copy frontend\.env.example frontend\.env
```

그다음 **서비스 키 하나를 정해 두 곳에 똑같이** 적습니다. 아무 문자열이면 됩니다 (예: 내가 정한 긴 단어).

```
backend/.env    DONWORRY_AI_SERVER_SERVICE_KEY=내가-정한-키
ai-server/.env  AI_SERVER_SERVICE_KEY=내가-정한-키
```

- 백엔드와 AI 서버가 서로를 알아보는 암호입니다. 둘이 다르면 사건 화면에 "AI 조사에 실패했어요"가 뜹니다
- 개인용 DB · 다른 비밀번호를 쓰면 `backend/.env`의 `DONWORRY_DB_NAME` · `DONWORRY_DB_PASSWORD`를 바꿉니다

> **예전 방식 `application-local.yml`을 쓰고 있었다면** 이제 그 파일은 읽지 않습니다.
> 그 안의 DB 이름 · 비밀번호를 `backend/.env`의 `DONWORRY_DB_NAME` · `DONWORRY_DB_PASSWORD`로 옮기고, 옛 파일은 지워도 됩니다.

예시 그대로 두면 이렇게 켜집니다.

| 설정 | 값 | 뜻 |
| --- | --- | --- |
| `DONWORRY_REPORT_WRITER` | `ai-server` | AI 조사를 AI 서버에 맡김 |
| `DONWORRY_CARD_COMPANY_DELAY` | `PT5S` | 판정 뒤 "조치 진행 중" 5초 |
| `AI_SERVER_MOCK_DELAY_SECONDS` | `1` | 가짜 AI가 단계마다 1초 쉼 → 조사 과정이 한 줄씩 보임 |
| `VITE_USE_MOCK` | (비움) | 화면이 실제 API를 씀 |

## 2. 켜기 (창 3개)

```powershell
# 창 1
cd backend
.\gradlew.bat bootRun

# 창 2
cd ai-server
uv sync
uv run uvicorn app.main:app --port 8000

# 창 3
cd frontend
npm install
npm run dev
```

창 1에 `Started DonWorryApplication`, 창 2에 `Application startup complete`가 보이면 준비됐습니다.

## 3. 시나리오 ① 결제 사기 의심

1. 새 탭에서 `http://localhost:5173/demo/shop` → **단체 행사용 케이크 세트(65만 원)** [결제하기] → **처음 쓰는 카드** → "결제를 확인하고 있습니다"
2. `http://localhost:5173/login`에서 `jiwon` / `1234` 로그인
3. 홈 → [확인할 결제 경보] → 김민수 · 65만 원 경보 → [사건 보기]
4. 사건 화면 [구매자 화면 열기 (시연)] → 새 탭에서 "아니요, 결제하지 않았어요"
5. 사건 화면으로 돌아오면 AI가 v2로 다시 조사하는 과정이 한 줄씩 그려집니다
6. [AI 보고서]에서 결론 확인 → 사건 화면에서 [승인 취소] + 사유 → [판정 확정]
7. "조치 진행 중" 약 5초 뒤 "종료" → 조치 센터에서 반영 확인

## 자주 겪는 문제

- **사건 화면 "AI 조사에 실패했어요"** — 서비스 키가 두 `.env`에서 다르거나, AI 서버(창 2)가 꺼져 있습니다. 키를 맞추고 두 서버를 다시 켠 뒤, 사건 화면 [AI 조사 다시 하기]를 누릅니다
- **`Port 8081 was already in use`** — 이미 켜진 백엔드가 있습니다. 그 창을 닫거나 `Ctrl+C`로 끕니다
- **`.env`를 고쳤는데 그대로** — 설정은 켤 때만 읽습니다. 그 서버를 껐다 켭니다
- **값을 비워 둔 줄** — `KEY=`처럼 남기면 "빈 값"이 됩니다. 안 쓸 줄은 지우거나 앞에 `#`을 붙입니다
- **테스트는 `.env`를 읽지 않습니다** — 내 PC 설정이 테스트 결과를 바꾸지 않게 막아 두었습니다
