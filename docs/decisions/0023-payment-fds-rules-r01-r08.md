# 0023. 결제 FDS 룰을 R01~R08로 바꾸고 판정 구간을 50 · 80으로

- **상태:** 제안
- **날짜:** 2026-10-27
- **관련:** 개인 저장소 Issue #96 (F-1), 신규 8개 룰 및 차단 시나리오 제안안 (팀 확정 전), ADR-0022
- **영향 받는 담당:** P2 fds (룰 · 판정), P3 investigation (경보 · 사건 화면), P4 report + ai-server (보고서 근거 이름), P5 payment (평가 입력)

## 배경

- 10/24안은 결제 룰 8개(고액 · 평소보다 큰 금액 · 처음 쓰는 카드 · 신규 계정 · 카드 테스팅 · 거절 후 재시도 · 해외/익명 접속 · 차단 목록)와 판정 구간 40 · 70으로 들어가 있었다.
- 팀이 정리한 새 룰안은 룰 구성 · 점수 · 판정 구간이 다르다. 같은 결제라도 저장소와 룰안의 점수 · 판정이 달라 시연과 설명이 어긋난다.
  - 예: 단골 김민수(평소 4만 원)가 처음 쓰는 카드로 65만 원 → 10/24안 55점(40 · 70 기준 REVIEW), 새 룰안 R01 30 + R03 25 = 55점(50 · 80 기준 REVIEW)
- 룰안은 "R07 차단 목록 외의 룰은 하나만 걸려서는 50점이 안 된다"(단독 판정 원칙)를 전제로 점수를 정했다.

## 결정

결제 FDS를 룰안 R01~R08로 바꾸고, 판정은 차단 목록 일치면 즉시 DENY → 그 밖에는 점수 합계 0~49 ALLOW · 50~79 REVIEW · 80 이상 DENY로 한다. 화면 점수는 `min(100, 합계)`로 보이고 원래 합계는 `fds_evaluations.raw_score`에 남긴다.

| 표시 번호 | rule_code | 이름 | 점수 |
| --- | --- | --- | --- |
| R01 | `HIGH_AMOUNT` | 고액 결제 (50만 원 이상) | 30 |
| R02 | `NEW_DEVICE` | 기존 미사용 단말기 | 25 |
| R03 | `NEW_CARD` | 기존 결제 이력 없는 카드 | 25 |
| R04 | `RAPID_REPEAT` | 특정 횟수 이상 결제 (10분 3번) | 30 |
| R05 | `HIGH_RISK_COUNTRY_IP` | 고위험 국가 IP | 40 |
| R06 | `CARD_TESTING` | 카드 테스팅 (1시간 카드 3장) | 45 |
| R07 | `BLOCKLIST` | 차단 목록 일치 (점수 계산 없이 DENY) | 100 |
| R08 | `DECLINE_RETRY` | 거절 후 재시도 (10분 거절 2번) | 35 |

- 코드는 영어(`rule_code`) 그대로 두고, R 번호는 `fds_rules.display_code`에 둔다. 화면 · AI 보고서 · 경보가 같은 번호를 쓴다
- 10/24안에만 있던 `AMOUNT_SPIKE` · `NEW_ACCOUNT` · `GEO_MISMATCH`는 행을 지우지 않고 폐지한다 (`enabled = false` + `retired_at`). 폐지 Rule은 평가 · 카탈로그에서 빠지고 다시 켤 수 없다
- 룰 · 차단 목록은 모든 고객사(가맹점)에 공통으로 적용한다. 비교 이력은 가맹점 + 구매자 단위로 나눈다
- R04 · R06 · R08은 같은 결제에서 각각 더한다 (중복 가산). 합계가 100을 넘으면 화면 점수만 100으로 자른다
- **FDS 평가 실패(ERROR)도 카드 승인 후 매입 보류(HELD) → 사건.** P2는 룰 계산 중 예외가 나면 예외를 던지지 않고 ERROR 평가(점수 없음 · `FDS_RULE_EVALUATION_FAILED`)를 남긴다. P5는 REVIEW처럼 승인을 받고 매입만 멈춘다. 평가 호출 자체가 예외로 끝나면(DB 장애 등) 지금처럼 결제창 오류 · PENDING
- **평가 입력 넓히기 (F-3).** `FdsEvaluationRequest`에 선택 칸 `merchantId` · `cardFingerprint` · `deviceId` · `clientIp` · `buyerEmail` · `hasPriorCapturedPayment` · `cardCompletedPayments`를 둔다 (필수 5개는 ADR-0014 그대로). 폐지된 평소보다 큰 금액용 `customerAverageAmount`는 뺀다. "과거 정상 결제"는 같은 가맹점 · 같은 구매자의 매입 완료(CAPTURED) 1건 이상 — 승인만 된 보류 · 취소 결제를 치면 사기범이 한 번 승인받은 뒤 R02 · R03을 피할 수 있다. P2는 평가 당시 가맹점을 `fds_evaluations.merchant_id`에 남긴다
- **R02 · R03 (#98 F-4).** 과거 정상 결제가 있는 구매자만 판단한다. R02는 P5가 센 `deviceCompletedPayments`(이 기기로 매입 완료한 결제 수)가 0이면, R03은 `cardCompletedPayments`가 0이면 적중. 과거 정상 결제가 없거나 기기 · 카드를 모르면 확인 불가(0점)로 이유를 남긴다
- **IP 이름표 · 시연 접속 환경 (#98 F-5).** `identity.api.IpLocator`가 IP → 나라 · 회선 종류를 찾는다 (지금은 `demo_fake_ips`, 나중에 GeoIP 파일). P5가 찾아 FDS 요청 `clientCountry` · `clientIpType`으로 넘기고, P2는 identity를 부르지 않는다. 결제창은 `donworry.demo.fake-client-ip`(`DONWORRY_DEMO_FAKE_CLIENT_IP`, 기본 false)가 켜졌을 때만 테스트 상점이 고른 `X-Demo-Client-IP` · `X-Demo-Device-Id` 헤더를 쓰고, IP는 이름표에 있는 값만 받는다. 시연 브라우저는 김민수의 "평소 기기"가 아니라서(기기 쿠키를 그냥 발급하면 시연 ①이 80점 DENY), 김민수 시드 결제에 평소 기기를 적고 테스트 상점에서 IP + 기기를 함께 고른다. 실제 기기 쿠키 발급은 CakeShop 연동 때
- **R05 고위험 국가 IP (#98 F-6).** 기준값 `{"countries": [...]}`에 있는 나라면 +40. 시연용 목록은 러시아 · 베트남 · 네덜란드(시연 IP 이름표의 해외 나라에서 고름, 실제 위험 국가 목록 아님). 이름표에 없는 IP는 확인 불가(0점) — 모르는 IP를 국내나 안전으로 치지 않는다
- 이번 결정은 카탈로그와 판정 구간까지다. R02 · R04 · R05 · R06 · R07 · R08의 계산과 R03의 "과거 정상 결제가 있는 구매자만" 조건은 묶음 ② · ③에서 Rule마다 붙인다. 그전까지 계산하지 않는 Rule은 기록 없이 0점이다

## 고려한 대안

| 대안 | 버린 이유 |
| --- | --- |
| 10/24안(40 · 70, 옛 8개) 유지 | 팀 룰안과 점수 · 판정이 달라 시연 설명이 어긋남 |
| 옛 Rule 행을 지우기 | 과거 평가(`fds_rule_hits`)가 `rule_code`로 가리키고 있어 기록을 읽을 수 없게 됨 |
| 옛 Rule을 `enabled = false`로만 두기 | 직원이 Rule 카탈로그에서 "다시 켜기"로 계산 코드가 없는 Rule을 켤 수 있음. 직원이 끈 Rule과 폐지한 Rule을 구분할 수 없음 |
| R 번호를 화면 상수로만 두기 | AI 보고서 · 경보 · 카탈로그가 번호를 따로 들고 있어 어긋날 수 있음 |
| ERROR면 지금처럼 승인 요청을 하지 않음 | 결제창이 오류로 멈추고 결제가 PENDING에 갇힘. 룰안 4절 "안전한 보류(HELD), 자동 승인 금지"와 다름 |
| ERROR를 자동 통과(ALLOW)로 | FDS가 고장 난 동안 사기 결제가 그대로 매입됨 |
| 과거 정상 결제를 "승인된 결제"로 | 승인만 된 보류 · 취소 결제도 이력이 돼서, 사기범이 한 번 승인받은 뒤 새 기기 · 새 카드 Rule을 피함 |
| P2가 결제 표를 직접 읽어 이력을 셈 | 모듈 경계(AGENTS 4절) 위반 — P2는 payments를 읽지 않는다 |
| 합계를 100에서 잘라서만 저장 | 원래 합계가 사라져 나중에 Rule 성적표 · 조정(L-2 · L-3)에서 "얼마나 넘었는지"를 볼 수 없음 |

## 영향

- API: `GET /api/fds/rules` 응답에 `displayCode`, 폐지 Rule 제외 · R01~R08 순. `GET /api/fds/rules/hit-stats`도 폐지 Rule 제외
- DB: `fds_rules.display_code` · `retired_at`, `fds_evaluations.raw_score` · `merchant_id` 추가. 룰 시드 교체 migration (`V20261027_211046` · `V20261027_211057` · `V20261027_211105` · `V20261027_215208`)
- 모듈 계약 (F-3): `fds.api.FdsEvaluationRequest` 선택 칸 추가 · `customerAverageAmount` 삭제. P5 `PaymentCreationService.Features`가 결제 · 이력에서 채운다
- 화면: 판정 구간 안내 · 용어 풀이 · 튜토리얼 문구 · Rule 카탈로그(표시 번호) · 결제 경보 "평소와 다른 점" · Mock 데이터. 폐지 Rule은 과거 기록 표시용 설명만 남김
- ai-server: 가짜 AI의 Rule 이름표를 새 이름으로, 폐지 Rule 이름은 과거 기록용으로 유지
- 테스트: FDS 단위 테스트(판정 경계 · 110점 · 폐지 Rule) · 시드 MariaDB 테스트 · 시연 ① 흐름 · 화면 시드 대조 테스트
- 결제 상태 (F-2): `PaymentRules` ERROR → 승인 요청, 승인 성공이면 HELD · `NOTIFY_HELD`. `RECORD_FDS_ERROR` 단계 삭제. AI 증거 창구 요약에 "FDS 평가 실패 N건", 사건 흐름도 카드에 "FDS 평가 실패 · 직원 확인"
- 문서: `docs/erd` 초기 데이터 표, ADR-0022의 판정 구간 문장, `docs/payment` 승인 분기 표

## 검증

- `./gradlew spotlessApply check` 통과, `./gradlew mariaDbTest` 130개 통과 (클라우드 MariaDB 10.11 직접 실행 — 테스트 설정의 11.8 컨테이너는 미검증)
- `npm run lint && npm run format:check && npm run build && npm test` (142개) · `npx playwright test --project=wide-1440` (시나리오 5개) 통과
- `uv run ruff format . && uv run ruff check . && uv run pytest` (69개) 통과
