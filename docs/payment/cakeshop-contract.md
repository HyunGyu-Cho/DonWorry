# CakeShop 결제 연동 계약

2026-10-24 · Issue #20 · 결정 이유와 버린 대안은 [ADR-0020](../decisions/0020-cakeshop-payment-integration-contract.md) · 상태: 제안 (구현 2-29, CakeShop C-1 ~ C-3)

이 문서는 CakeShop 서버 · 구매자 브라우저 · 돈워리 사이의 HTTP 약속을 정한다. [README](README.md)의 C1 · C7을 채운다.
시각은 모두 UTC ISO-8601, 금액은 원 단위 정수다.

## 1. 흐름

```text
구매자 브라우저          CakeShop 서버                     돈워리
  [주문하고 결제] ──▶     │                                   │
                          │ ① POST /api/v1/payments/ready ──▶ │ (API 비밀 키)
                          │ ◀── paymentId · checkoutUrl ───── │
  ◀── ② checkoutUrl로 이동                                    │
  ── ③ 카드 선택 · 결제 (돈워리 결제창, IP · 기기 직접 수집) ─▶ │ → FDS 평가 → 승인 · 보류 · 거절
  ◀── ④ returnUrl로 돌려보냄 (화면 이동용)                     │
                          │ ◀── ⑤ 결과 통지 (HMAC 서명) ───── │ 상태가 바뀔 때마다
                          │ ⑥ POST .../pickup-completed ────▶ │ → P6 정산 확정 (72시간)
```

## 2. 인증

| 방향 | 방법 |
| --- | --- |
| CakeShop → 돈워리 (①, 조회, ⑥) | 헤더 `X-DonWorry-Merchant: {merchant_code}`, `X-DonWorry-Key: {API 비밀 키}` |
| 돈워리 → CakeShop (⑤) | 헤더 `X-DonWorry-Timestamp: {보낸 시각}`, `X-DonWorry-Signature: hex(HMAC-SHA256(키, timestamp + "." + 본문))` |

- 키 원문은 환경변수에 두고 `merchants.secret_reference`가 그 이름을 가리킨다. DB · 로그 · 응답에 키 원문을 남기지 않는다.
- CakeShop은 서명이 맞지 않거나 보낸 시각이 5분보다 오래됐으면 통지를 버린다(재전송 공격 방지).

## 3. 결제 준비 ① — `POST /api/v1/payments/ready`

요청:

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `orderRef` | ✅ | CakeShop 주문번호 (가맹점 안에서 유일) |
| `orderTitle` | ✅ | 주문 이름 (메일 · 결과 화면 표시용, 100자 이하) |
| `amount` | ✅ | 결제 금액 (양수). 돈워리는 이 값만 믿는다 |
| `customerRef` | ✅ | CakeShop 회원 번호 |
| `buyerEmail` | ✅ | 결과 · 본인 확인 메일 주소 |
| `customerJoinedAt` | ✅ | CakeShop 가입 시각 (신규 계정 Rule) |
| `pickupAt` | ✅ | 픽업 예정 시각 (예상 정산일 = + 72시간) |
| `returnUrl` | ✅ | ④ 브라우저를 돌려보낼 CakeShop 주소 |

응답 `201` (같은 주문 재요청이면 `200`):

| 필드 | 설명 |
| --- | --- |
| `paymentId` | 돈워리 결제 번호 |
| `checkoutUrl` | 1회용 결제창 주소 `/checkout/{sessionToken}` |
| `expiresAt` | 결제창 만료 시각 (발급 후 15분) |
| `status` | 지금 결제 상태 (처음은 `PENDING`) |

- 같은 가맹점 · 같은 `orderRef` · 같은 금액이면 기존 결제와 결제창을 돌려준다. 결제창이 만료됐으면 새 결제창을 발급한다.
- 같은 `orderRef`인데 금액이 다르면 `PAY_021`로 거절한다.
- IP · 기기는 받지 않는다. 결제창이 직접 수집한다.

## 4. 결제창 ② ③ ④

| 경로 | 설명 |
| --- | --- |
| `GET /api/checkout/{sessionToken}` | 결제창 화면 정보: 가맹점 이름 · 주문 이름 · 금액 · 구매자 이름 · 가린 이메일 · 만료 시각 · 상태 |
| `POST /api/checkout/{sessionToken}/pay` | `{ cardToken }` 결제 실행 → 결과 종류 · 안내 문장 · `returnUrl` |
| `GET /api/checkout/demo-cards` | 시연용 모의 카드 목록 (demo 프로필 전용, 카드 번호 없이 토큰 · 가린 번호 · 발급국) |

- 결제창은 요청의 접속 IP(`X-Forwarded-For`는 신뢰하는 프록시에서만)와 결제창이 심은 기기 식별 쿠키를 FDS 입력으로 저장한다.
- demo 프로필에서만 `X-Demo-Fake-IP` 헤더를 `demo_fake_ips`로 바꿔 쓴다. 다른 프로필은 이 헤더를 무시한다.
- 카드 번호는 받지 않는다. 시연에서는 모의 카드 토큰(`cardToken`)만 쓴다.
- 결과 종류: `PAID`(결제 완료 — 카드 승인됨, 매입 보류 · 검토 중 포함) · `BLOCKED`(결제 불가 — FDS 거절 · 평가 실패) · `DECLINED`(카드사 거절). 구매자에게 검토 여부 · 점수 · 사유는 보이지 않는다 (ADR-0020 2026-10-27 개정, #86).
- ④ `returnUrl?paymentId=...&orderRef=...`로 돌려보낸다. CakeShop은 이 값으로 주문 상태를 바꾸지 않고, 통지 또는 조회 결과를 기다린다.

## 5. 결과 통지 ⑤ — `POST {merchants.webhook_url}`

본문:

| 필드 | 설명 |
| --- | --- |
| `eventId` | 통지 번호 (CakeShop 중복 처리용) |
| `paymentId` · `orderRef` | 결제 · 주문 |
| `status` | `PENDING` · `HELD` · `CAPTURED` · `DENIED` · `DECLINED` · `VOIDED` · `EXPIRED` |
| `statusVersion` | 결제별로 상태가 바뀔 때마다 1씩 늘어나는 번호 |
| `amount` | 결제 금액 |
| `occurredAt` | 상태가 바뀐 시각 |

- 상태가 바뀔 때마다 보낸다. HELD였다가 직원 판정으로 CAPTURED · VOIDED가 되면 다시 보낸다.
- CakeShop이 `2xx`로 답하면 성공. 그 밖의 응답 · 연결 실패 · 10초 초과면 1분 → 5분 → 30분 → 2시간 → 6시간 간격으로 다시 보낸다(최대 5회). 다 실패하면 발송 기록에 실패로 남기고 CakeShop은 조회 API로 복구한다.
- 역순 · 중복: CakeShop은 이미 받은 `statusVersion`보다 작거나 같은 통지를 무시하고 `2xx`로 답한다.
- CakeShop 표시: `HELD` · `PENDING`은 "결제 확인 중", `CAPTURED`만 "결제 완료".

## 6. 조회 — `GET /api/v1/payments/{paymentId}`

통지 유실 복구용. 응답은 통지 본문과 같은 필드(`eventId` 제외). 다른 가맹점 결제면 `404`.

## 7. 픽업 완료 ⑥ — `POST /api/v1/orders/{orderRef}/pickup-completed`

본문 `{ pickedUpAt }`. CAPTURED 결제만 받는다. 같은 주문의 두 번째 알림은 바꾸지 않고 `200`. P6는 `pickedUpAt + 72시간`을 정산 확정일로 저장한다(2-25).

## 8. 오류 코드

응답은 `code`가 있는 problem 형식이다.

| 코드 | HTTP | 뜻 |
| --- | --- | --- |
| `PAY_020` | 401 | 가맹점 인증 실패 (키 없음 · 틀림 · 비활성 가맹점) |
| `PAY_021` | 409 | 같은 주문번호에 다른 금액 |
| `PAY_022` | 410 | 결제창 만료 · 없음 |
| `PAY_023` | 409 | 이미 결제한 결제창 |
| `PAY_024` | 409 | 픽업 완료를 받을 수 없는 결제 상태 (CAPTURED 아님) |

`PAY_010` · `PAY_011`은 구매자 본인 확인 링크용이다(0-6).

## 9. 2-22 · 2-29에서 추가할 저장 (이번에는 migration 없음)

- `payments`: `order_title` · `pickup_at` · `picked_up_at`, `(merchant_id, order_ref)` UNIQUE
- 결제창 세션: 토큰 해시 · 결제 · 만료 시각 · 사용 시각 · 수집한 IP · 기기
- 결과 통지 발송 기록: 결제 · `status_version` · 상태 · 시도 횟수 · 다음 시도 시각 · 마지막 응답 코드
- 소유는 P5. `merchants`(P1)는 지금 컬럼으로 충분하다.
