# 0020. CakeShop 결제 연동 계약 (결제 준비 · 결제창 · 결과 통지 · 픽업 완료)

- **상태:** 제안
- **날짜:** 2026-10-24
- **관련:** Issue #20, [docs/payment C1 · C7](../payment/README.md#구현-전에-필요한-최소-계약), [계약 상세](../payment/cakeshop-contract.md), ADR-0014 · ADR-0018
- **영향 받는 담당:** P5 시은 (소유), P1 주환 (가맹점 인증 · merchants), P2 정후 (FDS 입력), P6 민정 (픽업 완료 → 정산 확정), CakeShop 저장소

## 배경

지금 P5는 내부 서비스(`createAndAuthorize`)만 있고, 가맹점이 결제를 요청하는 외부 HTTP API가 없다.
[docs/payment](../payment/README.md)의 C1(인증 · 가맹점 · 금액 검증 · 주문 중복)과 C7(조회 · 통지 스키마 · 인증 · 중복 · 역순 · 실패 복구)이 비어 있어 CakeShop 연동(C-1 ~ C-3)과 결제창 화면(1-9)을 만들 수 없다.
돈워리는 PG(결제 대행)이므로 결제 금액 · 구매자 접속 정보 · 결과를 가맹점과 구매자 브라우저 중 누구에게서 믿을지 먼저 정해야 한다.
`merchants`에는 이미 결과 수신 주소(`webhook_url`)와 서명 키 참조(`secret_reference`, 원문은 환경변수)가 있다.

## 결정

CakeShop과 돈워리는 아래 순서로 연동한다. 필드 · 오류 코드 · 재시도 간격은 [계약 상세](../payment/cakeshop-contract.md)를 정본으로 한다.

1. **결제 준비 (A)** — CakeShop **서버**가 `POST /api/v1/payments/ready`로 주문번호 · 주문 이름 · 금액 · 구매자 이메일 · CakeShop 가입일 · 픽업 예정 시각을 보내고, 1회용 결제창 주소를 받는다. 금액은 이 요청에서만 믿는다.
2. **결제창 (B)** — 구매자 브라우저가 돈워리 결제창 `/checkout/{sessionToken}`으로 이동한다. 구매자 IP · 기기 식별값은 **결제창이 직접 수집**해 FDS 평가에 쓴다. 시연용 가짜 IP 헤더는 demo 프로필에서만 받는다.
3. **결과 전달 (C)** — 결제가 끝나면 브라우저를 CakeShop 결과 페이지로 돌려보낸다(화면 이동용, 결과의 근거 아님). 진짜 결과는 돈워리가 CakeShop **서버**에 보내는 결과 통지다. 결제 상태가 바뀔 때마다(HELD → CAPTURED · VOIDED 포함) 다시 통지하고, 실패하면 재시도한다. 통지에는 결제별로 늘어나는 상태 버전 번호를 붙여 역순 도착을 걸러 낸다.
4. **가맹점 인증 (D)** — CakeShop → 돈워리 요청은 API 비밀 키 헤더로 인증한다. 돈워리 → CakeShop 통지는 같은 키로 만든 HMAC 서명과 보낸 시각을 헤더에 붙인다.
5. **주문 중복 (E)** — 같은 가맹점 · 같은 주문번호로 다시 준비를 요청하면 새 결제를 만들지 않고 기존 결제를 돌려준다. 금액이 다르면 거절한다.
6. **픽업 완료** — CakeShop 서버가 `POST /api/v1/orders/{orderRef}/pickup-completed`로 알리면 P6가 정산을 확정한다(픽업 완료 + 72시간). 같은 알림은 한 번만 반영한다.

CakeShop은 HELD · PENDING을 "결제 확인 중"으로만 표시하고 결제 완료로 표시하지 않는다(docs/payment 설계 3.4).

## 고려한 대안

| 대안 | 버린 이유 |
| --- | --- |
| A. 브라우저가 주소에 금액을 담아 결제창을 바로 연다 | 구매자가 주소의 금액을 고쳐 적은 금액으로 결제할 수 있다 |
| B. CakeShop이 구매자 IP · 기기를 결제 준비 요청에 담아 보낸다 | 가맹점 서버가 보는 값은 위조 · 누락될 수 있고, 가맹점마다 수집 방식이 달라 FDS 입력을 믿기 어렵다 |
| C. 브라우저 복귀 주소의 결과만으로 주문 상태를 바꾼다 | 구매자가 창을 닫으면 결과가 유실되고, 주소의 결과 값을 구매자가 조작할 수 있다 |
| C. 결과 통지를 최종 결과(CAPTURED · VOIDED)일 때 한 번만 보낸다 | 보안 확인(HELD) 중인 주문을 CakeShop이 알 수 없어 케이크를 미리 만들거나 주문을 잃어버린다 |
| D. 통지에 서명 없이 비밀 키를 그대로 실어 보낸다 | 통지 주소가 유출되면 키도 함께 유출되고, 본문 변조를 확인할 수 없다 |
| E. 같은 주문번호 재요청을 오류로 거절한다 | 네트워크 오류로 CakeShop이 다시 보낸 정상 요청이 실패한다. 같은 결제를 돌려주는 편이 안전하다(이중 청구 없음) |

## 영향

- API: 외부 `POST /api/v1/payments/ready` · `GET /api/v1/payments/{paymentId}` · `POST /api/v1/orders/{orderRef}/pickup-completed`, 결제창용 `GET /api/checkout/{sessionToken}` · `POST /api/checkout/{sessionToken}/pay` · `GET /api/checkout/demo-cards`(demo 전용). 구현은 2-29.
- DB: 이번에는 migration을 만들지 않는다. 2-22 · 2-29에서 추가할 것 — `payments` 주문 이름 · 픽업 예정 · 픽업 완료 시각, `(merchant_id, order_ref)` 중복 막기, 결제창 세션, 결과 통지 발송 기록(상태 버전 · 시도 횟수 · 다음 시도 시각). 소유는 P5, `merchants`는 P1.
- 화면: 1-9 결제창(`types/checkout.ts` · `api/checkout.ts`). 구매자에게 점수 · 사유를 보이지 않는다.
- 다른 담당: P2 FDS 입력에 결제창이 수집한 IP · 기기를 쓴다(2-22). P6 정산 확정 시각은 픽업 완료 알림에서 온다(2-25).
- CakeShop 저장소: C-1(결제 준비 · 결제창 이동) · C-2(통지 수신 · 서명 확인 · 주문 상태) · C-3(로컬 동시 실행).
- 모의 승인기: 지금 기본 구현은 모든 요청을 승인한다(mock-authorization.md). 결제창에서 시연용 카드사 거절을 보이려면 2-29에서 시연 카드별 결과를 정하는 내부 시연 진입점이 필요하다.

## 검증

- 이번 범위(계약 · 타입 · Mock): `npm run lint && npm run format:check && npm run build && npm test`
- 미검증: 서명 · 재시도 · 중복 막기는 2-29 구현 후 백엔드 테스트로 확인한다. CakeShop 쪽 서명 확인은 C-2에서 확인한다.
