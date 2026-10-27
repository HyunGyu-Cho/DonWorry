# 0022. 시연 뼈대 ① — 결제 · FDS · 사건 · AI · 조치를 실제로 잇기

- **상태:** 제안
- **날짜:** 2026-10-27
- **관련:** Issue #82 (PLAN S-1), [ADR-0009](0009-ai-investigation-call-structure.md), [ADR-0012](0012-payment-settlement-dependency.md), [ADR-0020](0020-cakeshop-payment-integration-contract.md)
- **영향 받는 담당:** P1 · P2 · P3 · P4 · P5 (혼자 개발하는 개인 저장소에서 한 번에)

## 배경

- 10/27 실제 서버로 시연 시나리오 ① "결제 사기 의심"을 눌러 보니, 화면은 Mock으로 다 있었지만 백엔드에 있는 API는 16개뿐이었다.
- 결제 → FDS → 사건이 이어지지 않았다. 시연 버튼이 FDS를 건너뛰고 가짜 결제(`MockPaymentInfoStore`)로 사건만 만들었다. 구매자 답변 · 금융 조치도 Mock이었다(`MockFinancialActionGateway`).
- 표(`fds_rules` · `notifications` · `buyer_confirmations` · `action_handoffs` …)와 화면 계약은 이미 있었고, 그 사이를 잇는 공개 경계 · 이벤트가 빠져 있었다.

## 결정

**모듈 사이는 받는 쪽이 import하는 `api` 경계와 커밋 뒤 이벤트로만 잇는다** (ADR-0012 방향 그대로, `allowedDependencies`는 바꾸지 않는다).

```
구매자 → 결제창(P5) → FDS 평가(P2, FdsEvaluator) → 매입 보류
   P5 ── PaymentHeld ──▶ P3 사건 생성 · 묶기 → P4 AI 조사
   P5 ── PaymentHeld ──▶ P5 구매자 본인 확인 요청 기록
구매자 답변 ── BuyerConfirmed ──▶ P3 사건 기록 · 증거 버전 +1 → P4 AI 재조사
직원 판정(P3) ── PaymentActions.request ──▶ P5 승인 취소(VOIDED) · 매입 진행(→ 정산 → CAPTURED)
```

| 경계 | 위치 | 하는 일 |
| --- | --- | --- |
| `PaymentHeld` 이벤트 | `payment.api` | 승인 저장과 같은 트랜잭션에서 발행. 사건 접수 · 본인 확인 요청이 커밋 뒤 받는다 |
| `BuyerConfirmed` 이벤트 | `payment.api` | 구매자 응답 저장 커밋 뒤 사건 쪽이 받는다 |
| `PaymentLookup` | `payment.api` | 결제 · 구매자 응답 읽기 (카드 번호 원문 · 지문은 내보내지 않음) |
| `PaymentActions` | `payment.api` | 판정 조치. 같은 결제 · 같은 조치는 한 번만 반영(멱등) |
| `FdsPaymentEvaluations` | `fds.api` | 결제별 최신 평가 · 경보 목록 · 상세 · 적중 Rule |
| `MerchantDirectory` · `StaffDirectory` | `identity.api` | 가맹점 이름 · 직원 표시 이름 |

- **FDS 평가 입력:** P2는 결제 표를 읽을 수 없으므로 P5가 자기 이력으로 "고객 평균 매입 금액 · 이 카드로 매입까지 끝낸 결제 수"를 계산해 `FdsEvaluationRequest`에 넣는다. 모르면 `null` → 그 Rule은 확인 불가(0점). → #96에서 평균 금액은 빠지고 가맹점 · 카드 지문 · 기기 · IP · 이메일 · 과거 정상 결제 여부가 추가됨 ([ADR-0023](0023-payment-fds-rules-r01-r08.md)).
- **Rule 기준값 · 점수는 `fds_rules`에서 읽는다.** 이번에는 시나리오 ①의 3개(고액 결제 · 평소보다 큰 금액 · 처음 쓰는 카드)만 계산하고 나머지 5개는 2-5. 판정 구간은 화면 안내와 같은 40점 직원 확인 · 70점 거절(기존 코드 50 · 80, 15만 원 · 35점 기준은 시드와 달라 바꿈). → 이후 룰 · 판정 구간은 [ADR-0023](0023-payment-fds-rules-r01-r08.md)(R01~R08 · 50 · 80)으로 바뀜.
- **결제 경보 화면은 investigation이 합쳐 준다** (`/api/investigation/payment-alerts`). FDS 평가에 결제(금액 · 주문 · 고객 이름)와 사건 번호를 붙이는 조회는 위층에 둔다 (AGENTS 4절).
- **판정 조치는 결제에 실제로 반영된 뒤 접수(ACCEPTED)로 본다.** 모의 카드사 처리 시간 `donworry.demo.card-company-delay`(기본 5초 · 테스트 0초) 동안 인계는 요청 상태이고 사건은 "조치 진행 중"이다. 지연이 있으면 조치를 따로 돌려 판정 응답을 바로 돌려준다.
- **구매자 본인 확인:** 매입 보류되면 `notifications`에 확인 요청(CHECK, 링크 토큰은 해시만)을 남긴다. 메일 발송은 2-23. 시연에서는 사건 화면 버튼이 링크를 새로 발급해 구매자 화면을 연다.
- **AI 증거 창구 `get_order_context`를 준비 상태로 바꾼다** (주문 이름 · 구매자 응답). 배송 · 픽업은 CakeShop 연동(2-29)에서.
- 지운 것: `MockPaymentInfoStore` · 시연 보류 결제 API(`POST /api/demo/held-payments`) · `MockFinancialActionGateway`.

## 고려한 대안

| 대안 | 버린 이유 |
| --- | --- |
| 시연 보류 결제 버튼을 남기기 | 빠르게 사건을 만들 수 있지만 FDS를 건너뛰는 길이 남아, 경보 목록과 사건이 서로 다른 이야기를 한다 |
| P2가 결제 표를 직접 읽어 평균 · 카드 이력 계산 | ADR-0012 의존 방향(P5 → P2)을 거꾸로 만든다 |
| 결제 경보 응답을 `/api/fds/evaluations`에 그대로 두고 화면이 결제 · 사건 API를 따로 부르기 | 목록 한 줄마다 요청이 늘고, 합치는 규칙이 화면에 흩어진다 |
| 조치를 바로 반영(지연 없음) | 판정하자마자 "종료"가 돼 시연에서 조치 단계를 볼 수 없다 (1-13 현규 결정 A와 같은 이유) |
| 결제창 세션을 메모리에 두기 | Spring을 다시 켜면 열린 결제창이 사라진다. CakeShop 연동(2-29)에서도 표가 필요하다 |

## 영향

- **API (새로):** 테스트 상점 `GET /api/demo/test-shop/products` · `POST …/orders`, 결제창 `GET /api/checkout/{token}` · `POST …/pay` · `GET /api/checkout/demo-cards`, `GET /api/payment/payments/{id}`, 구매자 확인 `GET` · `POST /api/public/buyer-confirmations/{token}`, 시연 링크 `POST /api/demo/buyer-confirmations/{paymentId}/link`, `GET /api/fds/rules` · `/hit-stats` · `/api/fds/blocklist`, `GET /api/investigation/payment-alerts` · `/{id}`, `GET /api/security-cases/handoffs`, `GET /api/investigation/approvals`
- **DB:** `payments`에 `order_title` · `buyer_name` · `pickup_at`, `checkout_sessions` 표, 시연 고객 지난 결제 5건 시드
- **화면:** 사건 목록 [테스트 상점 열기], 사건 화면 [구매자 본인 확인] 카드, 결제 경보 주소 변경, 사건 기록 문구
- **운영 전 남은 것:** 로그인 권한 막기(모든 API가 열려 있음), 테스트 상점 · 시연 API를 운영 프로필에서 끄기, 비동기 조치 실패 다시 보내기(이벤트 공통 설정)

## 검증

`./gradlew check mariaDbTest`(새 흐름 테스트 포함), `npm run lint · format:check · build · test`, `uv run pytest`, 클라우드에서 MariaDB + Spring + ai-server + 화면으로 시나리오 ① 1~9단계를 실제로 눌러 봄 (PR 테스트 결과).
