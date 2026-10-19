# TASK-001. 저장소 초기 구축 — 개발 착수 준비

- **Issue:** 없음 — GitHub Issue 를 아직 하나도 만들지 않았다 (이것도 남은 일이다)
- **상태:** 진행 중
- **브랜치:** `main` (브랜치 보호 미설정이라 직접 push 했다)
- **범위:** 저장소 전체. `backend/`, `frontend/`, `ai-server/`, `.github/`, `contracts/`, `docs/`
- **기간:** 2026-10-20 01:16 ~ 02:54 (커밋 12개, 추적 파일 141개)

## 지금 어디까지 왔나

### 1. 저장소와 원격

- `git init -b main` + `origin` = https://github.com/HyunGyu-Cho/DonWorry
- 커밋 12개 전부 `main` 에 push 완료. 로컬과 원격 동일
- `.gitignore`(모노레포 3종 + 비밀값), `.gitattributes`(LF 정규화, `gradlew` LF 고정)

### 2. Backend — 실행·테스트 가능

- Java 17 / Spring Boot 4.1.1 / Spring Modulith 2.1.1 / Gradle Wrapper 9.3.0
- 업무 모듈 5개 + 모듈별 하위 패키지. 빈 폴더에 `.gitkeep` 대신 `package-info.java` 를 두어
  무엇이 들어오는지와 담당자를 기록했다. `api` 패키지는 `@NamedInterface("api")`
- Flyway V1~V7 — 04-2 업무 테이블 25개 + `EVENT_PUBLICATION` + V7 스냅샷
- `application.yml` + `application-local.yml.example`. `ddl-auto=validate`
- 테스트: `ModularityTests`(2), `ArchitectureTests`(4), `SchemaMigrationTests`(4, `@Tag("db")`)

**돌린 명령과 결과**

```
cd backend && ./gradlew check                → BUILD SUCCESSFUL, 테스트 6건
cd backend && ./gradlew dbTest               → BUILD SUCCESSFUL, 테스트 4건
   (임시 MariaDB 12.2 인스턴스를 33077 포트에 띄워 검증 후 제거)
```

임시 인스턴스에서 확인한 것: 마이그레이션 7건 적용, 테이블 26개,
UNIQUE 제약 19건이 04-2 명세와 일치, `case_payments` 스냅샷 컬럼 3개,
`validate` 로 기동 성공.

### 3. Frontend — 검사 통과

- React 19 / TypeScript 5.9 / Vite 8 / react-router-dom 7
- `src/app`(Router·AuthProvider·RequireRole), `src/api`(05-1 경로 전부), `src/types`,
  `src/components`, `src/pages`
- AUTH-01 로그인은 구현. SEC·MER·ADM 11개 화면은 자리표시자. CS-01·02 는 CakeShop 소유라 없음
- ESLint 9 + Prettier 3 + TypeScript strict

```
cd frontend && npm run lint && npm run typecheck && npm run format:check && npm run build  → 전부 통과
```

### 4. AI Server — 검사 통과

- FastAPI / Pydantic 2 / uv / Python 3.13+
- `controller → service → agent` 분리. C04 계약 스키마(camelCase alias, `extra=forbid`)
- 멱등 키 `caseId + evidenceVersion`. 실패 시 `FAILED` 반환으로 직원 판정을 막지 않는다
- `LlmClient` 프로토콜 + `MockLlmClient`. Tool allowlist(읽기 전용)

```
cd ai-server && uv run ruff check . && uv run pytest  → ruff 통과, pytest 9건 통과
```

LLM 제공자는 미정이라 기본값이 `mock` 이다. LangGraph 배선은 제공자 확정 후.

### 5. CI — GitHub 러너에서 녹색 확인

- `frontend.yml` / `backend.yml`(check + schema) / `ai-server.yml`, 경로 필터로 바뀐 쪽만
- `backend / schema` 잡은 MariaDB 11.8 컨테이너에 Flyway 전체 적용 + `validate` 기동
- PR 템플릿(목적 / 변경 파일 / 계약 영향 / 테스트 결과 / 미검증 / Issue)

첫 실행에서 두 개가 깨졌고 고쳤다:

- `./gradlew: Permission denied` — Windows 에서 커밋해 `gradlew` 가 모드 100644 였다.
  `git update-index --chmod=+x` 로 해결. `.gitattributes` 에 적어뒀다
- `astral-sh/setup-uv@v10` 해석 실패 — 이 액션은 떠다니는 메이저 태그를 publish 하지 않는다.
  `v10.3.0` 으로 고정

### 6. 하네스 (06-2)

- `AGENTS.md` — 정본 지도, "결정됨 ≠ 구현됨 ≠ 검증됨", 작업 재개 절차, 서비스별 규칙, 검증 명령
- `CLAUDE.md` — 진입점만. 규칙은 복제하지 않는다
- `docs/decisions/` — 템플릿 + ADR 3건
- `contracts/` — C01·C04·C06 OpenAPI 3개 + C05 이벤트 JSON Schema.
  유효성 검증 통과, AI 서버 계약은 FastAPI 실제 스키마와 필드·required 일치 확인
- `tasks/` — 템플릿 + 이 파일

### 7. 발견해서 해소한 설계 충돌 — ADR-0003

문서 두 곳이 서로 반대 방향 Java 의존을 허용하고 있었다.

- 02-1 §4: `payment → investigation.api` (C03)
- 05-2: `Investigation → PaymentReader` (payment.api)

두 방향을 각각 쓰는 최소 클래스를 넣고 돌려 확인했다:

```
Cycle detected: Slice investigation -> Slice payment -> Slice investigation
```

`ApplicationModules.verify()` 가 실패하므로 CI `backend/check` 가 막힌다. 구현 첫날
부딪히는 문제였다. **A안 채택** — investigation 이 payment 를 import 하지 않고, SEC-01·02 가
쓰는 결제 사실은 C03 요청이 넘긴 값을 `case_payments` 연결 시점 스냅샷으로 둔다.

적용한 것: `V7` 마이그레이션, `ArchitectureTests` 금지 규칙(위반 시 실제로 실패하는 것 확인),
`AGENTS.md`·README·package-info, **Notion 02-1 §4 와 05-2 수정**.

### 8. 커밋 목록

| 커밋 | 내용 |
| --- | --- |
| `e47a3ed` | 저장소 초기 구조 및 프로젝트 문서 |
| `efd0295` | Spring Boot·Gradle 빌드 설정과 MariaDB 연결 |
| `d2e7b2d` | DB·계정 생성 스크립트와 DB 포트 주의사항 |
| `2cce398` | 04-2 테이블 명세대로 Flyway 초기 마이그레이션 |
| `19e48c3` | Modulith JDBC 교체 + `ddl-auto=validate` |
| `8cc5e1b` | frontend·ai-server 스캐폴드 |
| `5d43022` | GitHub Actions CI + ArchUnit·스키마 검사 |
| `b887718` | gradlew 실행 권한, setup-uv 태그 수정 |
| `17b6b53` | 하네스 골격 (AGENTS·CLAUDE·ADR·contracts·tasks) |
| `d440e2f` | 모듈별 하위 패키지 구조 |
| `8ff9ea6` | ADR-0003 A안 적용 |
| `94dd50f` | ADR-0003 에 Notion 갱신 반영 |

## 다음 행동

**순서대로.** 1~3 이 끝나면 6명이 각자 병렬로 착수할 수 있다.

1. **DB 생성** — `docs/db/01-create-database.sql` 을 MariaDB 관리자 계정으로 1회 실행.
   이 머신은 3306 이 MySQL 8.0.40, MariaDB 는 3307 이므로 `-P 3307` 로 접속하고
   `application-local.yml` 이 이미 3307 을 가리킨다. 실행 후 `./gradlew bootRun` 으로 기동 확인
2. **GitHub Issue 분해** — 06-2 가 담당·우선순위·진행 상태의 정본이라고 한 곳이 비어 있다.
   시연 경로를 모듈별로 쪼개 담당자에게 배정
3. **브랜치 보호** — CI 잡을 필수 상태로 등록, `main` 직접 push 금지, 승인 1명 (06-3).
   지금은 CI 가 빨간불이어도 병합된다
4. **`SecurityConfig`** — 지금은 모든 요청이 401 이다. 첫 엔드포인트를 만들면 바로 막힌다
5. **시연 경로 구현** — payment(C01·C07·상태 전이) → fds(C02) → investigation(C03·C05) →
   payment 리스너(C06). 엔티티부터
6. **시드 데이터** — 가맹점·API Key·직원 계정. 시연에 필수

## 막힌 것

- **DB root 비밀번호** — 내가 입력할 수 없어 `01-create-database.sql` 을 실행하지 못했다.
  사람이 직접 돌려야 한다
- **브랜치 보호** — 저장소 설정 변경이라 승인이 필요하다
- **MariaDB 12 의 혼란스러운 오류** — 없는 계정으로 접속하면 "Access denied" 대신
  `GSS-API authentication exception` 이 나온다. 계정이 없다는 뜻이다.
  `docs/db/01-create-database.sql` 문제 해결 절에 적어뒀다
- **OneDrive 가 `build/` 를 잠근다** — `./gradlew build` 가
  `Unable to delete directory ...build\test-results` 로 실패하면 `rm -rf backend/build` 후 재실행.
  반복되면 프로젝트를 OneDrive 밖으로 옮기는 편이 낫다

## 미검증 / 안 한 것

- 업무 코드 0줄. `package-info.java` 39개와 진입점 1개뿐이다
- 25개 테이블에 대응하는 JPA 엔티티·리포지토리 없음
- Docker 구성 (06-4) — Dockerfile 3개, `infra/docker/` compose 3종
- 하네스 Hook·Skill (06-2) — SessionStart 훅, `project-resume`/`save` 스킬.
  **자동 저장은 보장되지 않는다**
- 계약 파일로 구현을 검증하는 테스트 — `contracts/` 는 아직 사람이 읽는 정의다
- Testcontainers 업무 통합 테스트 (결제 멱등·Case 잠금·정합성)
- CakeShop 쪽 작업 — C01 호출과 C06 수신. 이 저장소 밖이고 아직 없다
- Notion 02-1 하단 다이어그램 이미지 2개 — 이전 의존 방향을 그렸을 수 있다.
  Mermaid 로 다시 그리기로 했으나 보류 중

## 일정 메모

시연 10/23(금), 작성 시점 10/20. **3일**이고 시연 경로가 전부 미구현이다.
02-1 기준 주환이 identity + 프론트엔드 + CakeShop 화면을 겸해 부하가 한 사람에 몰린다.

## 기록

### 2026-10-20 (최신이 위)

- 02:54 ADR-0003 에 Notion 갱신 결과 반영. Notion 02-1 §4·05-2 수정 완료
- 02:51 ADR-0003 A안 적용. V7 + ArchUnit 금지 규칙. 규칙이 실제로 실패하는지 확인 후 되돌림
- 02:44 모듈별 하위 패키지. 구조를 잡다가 `investigation ↔ payment` 순환 발견, 실험으로 확인
- 02:37 하네스 골격. 계약 파일 유효성 + AI 서버 계약↔구현 필드 대조 통과
- 02:28 CI 첫 실행이 2건 실패 → gradlew 권한, setup-uv 태그 수정 → 전부 녹색
- 02:22 frontend·ai-server 스캐폴드. TypeScript 7 ↔ typescript-eslint 비호환으로 5.9 고정 (ADR-0002)
- 02:09 `ddl-auto` 를 `none` → `validate` 로. Modulith JPA → JDBC 교체가 조건이었다 (ADR-0001)
- 01:56 Flyway V1~V6. 임시 MariaDB 로 적용·제약 19건 대조
- 01:35 DB·계정 생성 스크립트. 3306 이 MySQL 임을 발견해 포트 주의사항 추가
- 01:27 Gradle·Spring Boot 설정. Boot 4 에서 Flyway 자동 구성 분리, Jackson 3 속성 변경 두 함정
- 01:16 저장소 초기 구조. Notion 트리 전체(01~06) 읽고 시작
