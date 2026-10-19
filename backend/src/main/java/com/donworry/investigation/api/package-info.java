/**
 * C03 attachOrCreateCase 와 CaseDecisionMade 이벤트 타입 (Notion 05-2, 05-3).
 *
 * <p>이 패키지만 다른 모듈에 공개된다 (Notion 02-1). 여기 들어오는 타입은
 * 공개 계약이므로 바꿀 때 Notion 05 와 호출하는 모듈의 테스트를 함께 고친다.
 *
 * <p><b>ADR-0003:</b> C03 {@code CaseLinkRequest} 는 SEC-01·02 화면이 쓸 결제 사실을
 * 함께 받는다 — {@code orderId}, {@code amount}, {@code paymentStatus}. investigation 은
 * 이 값을 {@code case_payments} 에 연결 시점 스냅샷으로 저장하며
 * {@code payment.api.PaymentReader} 를 조회하지 않는다. 역방향 의존은 순환이 된다.
 */
@org.springframework.modulith.NamedInterface("api")
package com.donworry.investigation.api;
