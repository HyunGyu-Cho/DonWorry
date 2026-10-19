# AGENTS.md

사람과 AI 도구가 이 저장소에서 작업할 때 공통으로 따르는 규칙. 특정 도구에 묶이지 않는다.
Claude Code는 [CLAUDE.md](CLAUDE.md)로 진입하고 규칙은 이 파일을 참조한다.

운영 정책의 정본은 Notion 06이다. 이 파일은 **저장소 안에서 검증 가능한 것**만 적는다.

## 1. 정본이 어디 있나

| 알고 싶은 것 | 보는 곳 |
| --- | --- |
| 업무 정책·시연 목표 | Notion 01 |
| 서비스별 코드 구조·의존 방향 | Notion 02-1(Backend) / 02-2(Frontend) / 02-3(AI Server) |
| 화면 13개 명세 | Notion 03 |
| 테이블·설계 결정(DEC-01~13) | Notion 04 |
| API·이벤트 계약 설명 | Notion 05 |
| 컨벤션·하네스·CI·Docker | Notion 06 |
| **검증 가능한 계약 파일** | [`contracts/`](contracts/) |
| **아키텍처 결정 기록** | [`docs/decisions/`](docs/decisions/) |
| **DB 스키마 정본** | `backend/src/main/resources/db/migration/` |
| **실제 동작하는 검사 규칙** | `eslint.config.js`, `tsconfig.*.json`, `build.gradle`, `pyproject.toml`, `.github/workflows/` |
| 담당·우선순위·진행 상태 | GitHub Issue |
| 여러 세션에 걸친 작업 맥락 | [`tasks/`](tasks/) |

**Notion은 "왜"를, 저장소는 "무엇이 실제로 그러한지"를 담는다.** 둘이 어긋나면 저장소가 사실이고
Notion이 의도다. 어긋난 것을 발견하면 임의로 한쪽을 고치지 말고 영향 범위를 적어 올린다.

## 2. 결정됨 ≠ 구현됨 ≠ 검증됨

| 상태 | 뜻 |
| --- | --- |
| 결정됨 | Notion 또는 ADR에 선택이 기록됨 |
| 구현됨 | 해당 파일이 Git에 존재함 |
| 검증됨 | 실제로 명령을 돌려 통과한 결과가 있음 |

**돌려보지 않은 것을 "완료"라고 쓰지 않는다.** 검증하지 못했으면 PR 본문의 "미검증"에 적는다.

## 3. 작업 시작할 때

1. `git branch --show-current`, `git status`, `git log --oneline -5`로 현재 위치를 확인한다.
2. 해당 GitHub Issue와, 건드릴 영역의 계약(`contracts/`)·결정(`docs/decisions/`, Notion 04-3 DEC)을 읽는다.
3. 테스트 결과가 있다면 **어느 커밋에서 나온 것인지** 확인한다. 오래된 결과를 현재 상태로 믿지 않는다.
4. 완료 / 진행 중 / 미검증을 구분한 뒤 다음 행동을 고른다.
5. 문서와 코드가 충돌하면 **고치기 전에 영향 범위를 먼저 제시**한다.

여러 세션에 걸칠 작업이면 `tasks/TASK-###.md`에 실행 맥락을 남긴다. 짧게 끝나는 작업은 만들지 않는다.

## 4. 코드 규칙

전체 컨벤션은 Notion 06-1. 저장소에서 꼭 지켜야 하는 것만:

**공통**

- 비밀값(API Key, 비밀번호, 토큰)을 소스·로그·커밋에 넣지 않는다. `.env.example`에는 이름만 둔다.
- 공개 계약을 바꾸면 `contracts/`·Notion 05·관련 테스트를 **같은 PR에서** 함께 고친다.
- 자동 포매터 결과를 그대로 받는다. 개인 취향보다 팀 일관성이 우선이다.

**Backend** (`backend/`)

- 업무 모듈은 identity / payment / fds / investigation / settlement 5개. 늘리지 않는다.
- 다른 모듈의 `repository/`·`entity/`를 직접 참조하지 않는다. 공개 `api/` 계약만 쓴다.
- **`investigation`은 `payment`를 import하지 않는다.** `payment → investigation.api`는 C03 호출과
  `CaseDecisionMade` 이벤트 타입으로 유지되고, 역방향이 생기면 모듈 순환이 된다.
  SEC-01·02가 쓰는 결제 사실은 C03 요청이 넘긴 값을 `case_payments` 스냅샷으로 둔 것을 쓴다
  ([ADR-0003](docs/decisions/0003-investigation-payment-cycle.md)). `ArchitectureTests`가 강제한다.
- Controller → Service/api → Repository. Controller가 Repository를 직접 호출하지 않는다.
- DB 스키마는 Flyway 마이그레이션만 바꾼다. **이미 적용된 마이그레이션 파일은 수정하지 않고** 새 버전을 추가한다.
- `ddl-auto`는 `validate`. `create` / `create-drop` / `update`로 바꾸지 않는다.
- 결제·Case 중복은 DB UNIQUE와 행 잠금으로 막는다. 외부 Mock 요청은 영속 키로 멱등 처리한다.

**Frontend** (`frontend/`)

- HTTP 호출은 `src/api/`에만 둔다. 화면 안에서 직접 `fetch`하지 않는다.
- TypeScript strict. `any`를 쓰지 않는다.
- 결제 승인·FDS 점수·권한 판정은 백엔드 소유다. 화면 가드는 편의일 뿐 인가가 아니다.
- CS-01·02는 CakeShop 소유 화면이므로 여기에 구현하지 않는다.

**AI Server** (`ai-server/`)

- controller → service → agent/tool 역할을 섞지 않는다.
- Agent는 allowlist에 등록된 Tool만 호출한다. 결제 승인·데이터 변경은 하지 않는다.
- 요청·응답은 Pydantic 모델로 받고 내보낸다.
- LLM 호출은 `LlmClient` 경계를 지난다. 제공자를 바꿀 때 service를 고치지 않는다.

## 5. 검증 명령

바꾼 영역의 명령을 돌리고 결과를 PR에 붙인다.

```bash
# Backend
cd backend && ./gradlew check          # 단위 + Modulith 경계 + ArchUnit
cd backend && ./gradlew dbTest         # 실제 MariaDB 필요 (DONWORRY_TEST_DB_* 환경변수)

# Frontend
cd frontend && npm run lint && npm run typecheck && npm run format:check && npm run build

# AI Server
cd ai-server && uv run ruff check . && uv run pytest
```

## 6. 브랜치·PR

- Issue → feature 브랜치 → 로컬 검사 → PR. `main`에 직접 push하지 않는다.
- 브랜치 이름에 작업 범위를 담는다. TASK가 있으면 ID를 넣는다.
- PR 본문은 [템플릿](.github/pull_request_template.md)을 채운다. "미검증"을 비워두지 않는다.
- 공통 계약(`contracts/`)이나 DB 마이그레이션을 바꾸면 해당 모듈 담당자 리뷰를 받는다.
- 병합은 Squash를 권장한다.

## 7. 설계를 바꿀 때

중대한 변경(모듈 경계, 저장 방식, 외부 계약, 기술 선택)은 `docs/decisions/`에 ADR을 남긴다.
작은 구현 선택은 ADR 대상이 아니다.

ADR에는 **무엇을 고르지 않았는지와 그 이유**를 반드시 적는다. 영향 범위(API·DB·화면·테스트)를
적고 그 범위를 같은 PR에서 함께 고친다.

Notion 04-3의 DEC를 뒤집는 변경이면 DEC ID를 ADR에 적고 Notion도 갱신한다.

## 8. AI 도구를 쓸 때

- **지시서만으로 금지 규칙이 강제된다고 보지 않는다.** 실제 강제는 CI와 리뷰다.
- 작업 완료 표시를 그대로 믿지 않는다. 코드·Git·검증 결과로 대조한다.
- 세션은 소모품이다. 알아야 할 것은 Git·코드·테스트·Issue에 남긴다.
- 모르는 것을 추측으로 메우지 않는다. 확인할 수 없으면 확인할 수 없다고 적는다.
