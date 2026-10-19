# CI 워크플로

정책 정본은 Notion 06-3 CI 및 GitHub 협업. 여기는 실제로 돌아가는 검사만 적는다.

| 파일 | 트리거 경로 | 잡 |
| --- | --- | --- |
| `frontend.yml` | `frontend/**` | ESLint · `tsc -b` · Prettier `--check` · 프로덕션 빌드 |
| `backend.yml` | `backend/**` | `check`: `./gradlew check` (JUnit · Modulith `verify()` · ArchUnit)<br>`schema`: 빈 MariaDB 11.8 에 Flyway 전체 migration + JPA `validate` |
| `ai-server.yml` | `ai-server/**` | `ruff check` · `ruff format --check` · `pytest` (Mock LLM) |

## 설계 의도

- **경로 필터**: 세 서비스가 한 저장소에 있으니 바뀐 쪽만 검사한다.
- **DB 분리**: 실제 MariaDB 가 필요한 테스트는 `@Tag("db")` 로 떼어 `./gradlew dbTest` 에서만 돈다.
  그래서 `./gradlew check` 는 Docker·DB 없이 어디서나 돈다 (06-3 점진적 도입).
- **`uv sync --locked`**: `uv.lock` 과 어긋나면 실패한다. 잠금 파일을 CI 가 조용히 갱신하지 않는다.
- **`npm ci`**: `package-lock.json` 기준으로만 설치한다.

## 겪은 문제

- `./gradlew: Permission denied` (exit 126) — Windows 에서 커밋하면 `gradlew` 가 모드 `100644`
  로 들어가 Linux 러너에서 실행되지 않는다. `git update-index --chmod=+x backend/gradlew` 로
  `100755` 로 바꿔야 한다.
- `astral-sh/setup-uv` 는 떠다니는 메이저 태그(`v10`)를 publish 하지 않는다. 정확한 버전
  (`v10.3.0`)을 써야 액션이 해석된다.

## 아직 안 된 것

- **브랜치 보호 규칙.** 이 잡들을 GitHub 저장소 설정에서 필수 상태로 등록해야 CI 실패가 병합을 막는다.
  등록 전에는 워크플로가 빨간불이어도 Merge 버튼이 열려 있다.
- Testcontainers 기반 업무 통합 테스트(결제 멱등·Case 잠금·정합성). 06-3 의 '통합 전' 단계.
- AI 리뷰 연동. 06-3 기준 승인 권한은 없고 위험 후보 탐지 보조용이다.
