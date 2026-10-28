# 0025. Rule 켜기 · 끄기 · 차단 해제 반영과 비슷한 과거 사건

- **상태:** 제안
- **날짜:** 2026-10-28
- **관련:** 개인 저장소 Issue #104 (B 2-7 · 2-9a), ADR-0024 (관리자 승인 · 감사 로그), ADR-0012 (모듈 의존 방향), ADR-0009 (AI 증거 창구)
- **영향 받는 담당:** P2 fds (Rule 켜기 · 끄기 · 차단 해제), P3 investigation (승인 반영 · 비슷한 과거 사건), P4 investigation/report (증거 창구 · 보고서 칸), P5 payment (같은 값 쓴 결제 찾기), 화면 (오류 문구 · 감사 로그 · 보고서 변환)

## 배경

- ADR-0024로 보안 직원이 Rule 끄기 · 차단 해제를 요청하고 보안 관리자가 승인할 수 있게 됐지만, 승인해도 실제로는 아무것도 바뀌지 않았다. 차단을 풀려면 시연용 DB에서 SQL을 직접 돌려야 했다.
- 화면에는 Rule 다시 켜기 버튼과 오류 코드(`FDS_010` · `FDS_011`)가 이미 있었지만 백엔드 API가 없었다.
- AI 보고서의 "비슷한 과거 사건" 칸은 늘 비어 있었고, AI 증거 창구 `find_similar_cases`는 "데이터 준비 전"으로만 답했다.

## 결정

### Rule 켜기 · 끄기 · 차단 해제 (2-7)

- **켜기는 바로, 끄기 · 해제는 관리자 승인 뒤.** 켜기는 탐지를 강하게 하는 쪽이라 보안 직원 · 관리자가 승인 없이 바로 한다 (`POST /api/fds/rules/{ruleId}/enable`). 끄기 · 해제는 탐지를 약하게 하므로 ADR-0024의 관리자 승인을 거친다
- **켜고 끌 수 있는 Rule = 폐지 안 된 결제 Rule.** R07 차단 목록은 재범 방지, 직원 Rule은 탈취한 계정이 흔적을 지우지 못하게 막는다 (화면 `canToggle`과 같은 규칙)
- **fds 오류 코드.** `FDS_010` 권한 없음 · 끌 수 없는 Rule(403), `FDS_011` 이미 켜짐(409), `FDS_012` 없는 · 폐지 Rule(404), `FDS_013` 로그인 필요(401). fds 모듈 controller 범위 처리기(`FdsExceptionHandler`)로 `{code, detail}`을 돌려준다 (공통 처리기는 02-code 3절 보류)
- **요청 때 대상 확인.** 바꿀 것이 없는 요청은 받지 않는다: 없는 Rule · 폐지 · 끌 수 없는 Rule · 이미 꺼진 Rule에 끄기 요청, 없는 · 이미 풀린 · 만료된 차단에 해제 요청 → `INV_025`(409). 기준값 요청은 있는 Rule인지만 본다
- **승인 = 반영.** 승인 트랜잭션 안에서 investigation이 `fds.api.FdsRuleSwitch.disable` · `BlocklistRegistry.release`를 부른다 (investigation → fds는 허용된 방향). 처리자는 승인한 관리자(`fds_rules.updated_by` · `blocklist_entries.released_by`). 평가는 결제마다 `fds_rules` · 차단 목록을 새로 읽으므로 다음 결제부터 반영된다
- **승인 때 이미 바뀌었으면.** 요청 뒤 다른 경로로 이미 꺼졌거나 풀렸으면 승인은 처리하고 아무것도 바꾸지 않는다. 감사 로그 detail에 `changed: false`와 이유("이미 꺼져 있음" · "이미 풀려 있음")를 남긴다
- **감사 로그.** 끄기 반영 `RULE_DISABLED` · 해제 반영 `BLOCKLIST_RELEASED`는 승인과 같은 트랜잭션. 켜기 `RULE_ENABLED`는 fds가 `fds.api.FdsRuleEnabled` 이벤트를 내고 investigation이 커밋 뒤 저장한다 (로그인 기록과 같은 방식, fds는 investigation에 의존하지 않음)

### 비슷한 과거 사건 (2-9a)

- **찾는 곳은 P3, 값 비교는 P5.** P3 `SimilarCaseService`가 판정이 끝난 결제 사건을 후보로 고르고, P5 `PaymentLookup.sharedValues(paymentId, 후보 결제)`가 무엇이 같은지만 돌려준다. 카드 지문 · 기기 · IP · 이메일 원래 값은 P5 밖으로 나가지 않는다
- **강한 근거.** 같은 카드 · 기기 · IP · 이메일(가맹점 상관없이, 이메일은 대소문자 무시), 같은 고객(같은 가맹점 안). 지금 결제의 IP가 사내망(OFFICE)이면 같은 IP는 근거에서 뺀다 (직원 PC가 겹칠 뿐)
- **약한 근거.** 적중한 Rule 조합이 완전히 같을 때만 (Rule 2개 이상). Rule 하나만 같은 것은 흔해서 뺀다
- **범위.** 사건 결제가 모두 판정된 결제 사건만(하나라도 승인 취소면 `FRAUD`, 모두 매입 허용이면 `NORMAL`), 지금 사건 제외, 사건이 만들어진 지 90일 안, 최대 5건, 강한 근거 먼저 · 그 안에서 최근 사건 먼저
- **쓰는 곳.** AI 증거 창구 `find_similar_cases`를 연다(`ready=true`). 보고서 "비슷한 과거 사건" 칸은 AI가 쓰지 않고 Spring이 저장 시점에 채운다 — ai-server 작성기(`ConclusionReportBuilder`) · 가짜 작성기(`FakeReportWriter` → 화면 `reportConvert`) 둘 다. ai-server 코드는 바꾸지 않는다. 판정의 참고 근거일 뿐 자동 판정에 쓰지 않는다
- **시연 데이터는 넣지 않는다.** 새 DB 첫 시연은 "비슷한 과거 사건이 없어요"가 맞다. 시나리오 ①을 한 번 끝까지 판정하면 다음 시연의 과거 사건이 된다 (현규 결정, 10/28)

## 고려한 대안

| 대안 | 버린 이유 |
| --- | --- |
| 끄기 · 해제 반영을 승인 뒤 이벤트로 fds에 넘기기 | investigation → fds 호출이 허용된 방향이라 이벤트가 필요 없음. 같은 트랜잭션이면 승인만 되고 반영이 빠지는 일이 없다 |
| 켜기 감사 로그를 fds가 audit_logs에 직접 쓰기 | `audit_logs`는 P3 소유, fds → investigation 의존은 순환. 이벤트로 넘김 |
| 이미 바뀐 대상의 승인을 오류로 막기 | 관리자는 할 일이 없는데 요청이 대기 목록에 계속 남음. 처리하고 이유만 남김 |
| P5가 같은 값을 쓴 결제를 전부 찾아 돌려주기 | 사내망 IP · 단골 고객처럼 값이 흔하면 결과가 끝없이 커짐. P3가 판정 끝난 사건의 결제만 후보로 넘겨 범위를 고정 |
| 카드 지문을 P3로 넘겨 P3가 비교 | 지문이 모듈 밖으로 나가면 보고서 · 화면으로 샐 길이 생김 |
| Rule 하나만 같아도 약한 근거 | 고액 결제 같은 Rule은 대부분 사건에 걸려 근거가 부풀려짐 |
| 과거 사건 1건을 Flyway 시드로 넣기 | 결제(P5) · FDS 평가(P2) · 사건 · 판정(P3) 테이블에 걸쳐 한 역할 안에서 끝나지 않고, 테이블이 바뀔 때마다 새 migration이 필요 |
| local 프로필에서 Java로 시연 사건 만들기 | 팀에 선례가 없음. 리허설 한 번이면 진짜 데이터로 채워짐 |

## 영향

- API (새로): `POST /api/fds/rules/{ruleId}/enable`
- API (바뀜): `POST /api/investigation/approvals` 대상 확인(`INV_025`), `POST /api/investigation/approvals/{id}/decision` 승인하면 Rule 끄기 · 차단 해제 반영
- 오류 코드: `FDS_010` · `011` · `012` · `013`, `INV_025`
- DB: 바뀌지 않음. `fds_rules.enabled` · `updated_by` · `updated_at`, `blocklist_entries.released_at` · `released_by`를 처음 씀
- 모듈 계약: `fds.api.FdsRuleSwitch` · `FdsRuleEnabled` · `TargetChange` 추가, `BlocklistRegistry`에 `state` · `release` 추가, `payment.api.PaymentLookup.sharedValues` 추가. 모듈 의존 방향은 그대로
- AI 증거 창구: `find_similar_cases` 열림 — 응답 `data`는 화면 `SimilarCase`와 같은 모양
- 보고서: `similarCases` 칸을 Spring이 채움 (가짜 작성기 본문에도 `similarCases` 추가)
- 화면: `INV_025` 오류 문구, 감사 로그 `RULE_DISABLED` · `BLOCKLIST_RELEASED` 이름 · 반영 안 한 이유, `reportConvert`가 옛 형식 본문의 `similarCases`를 그대로 씀
- 문서: `docs/demo-run.md` 3-3 차단 해제 · Rule 끄기, 비슷한 사건 리허설 안내
- 테스트: Rule 켜기 · 끄기 반영 · 차단 해제 · 요청 대상 확인 · 감사 로그, 비슷한 사건 강한 · 약한 근거와 빼는 조건, 증거 창구 · 보고서 칸 (MariaDB). 기존 승인 테스트는 실제로 있는 대상으로 요청하도록 바꿈

## 검증

- `cd backend && ./gradlew spotlessApply check mariaDbTest` · `cd frontend && npm run lint && npm run format:check && npm run build && npm test` — 결과는 PR #104 본문
