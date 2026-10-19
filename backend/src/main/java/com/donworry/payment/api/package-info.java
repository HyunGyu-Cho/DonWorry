/**
 * PaymentReader — 결제 금액·상태·가맹점·고객 참조·생성 시각과 최근 결제 건수 조회 (Notion 05-2).
 *
 * <p>이 패키지만 다른 모듈에 공개된다 (Notion 02-1). 여기 들어오는 타입은
 * 공개 계약이므로 바꿀 때 Notion 05 와 호출하는 모듈의 테스트를 함께 고친다.
 */
@org.springframework.modulith.NamedInterface("api")
package com.donworry.payment.api;
