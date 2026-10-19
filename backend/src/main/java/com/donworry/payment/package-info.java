/**
 * 결제 접수·상태 관리·모의 카드 승인·CakeShop 최종 결과 통보 (Notion 02-1).
 *
 * <p>담당: 시은
 *
 * <p>다른 모듈에서 쓸 수 있는 것은 {@code payment.api} 패키지뿐이다.
 * 이 모듈의 {@code repository}·{@code entity}를 다른 모듈이 직접 참조하면
 * {@code ModularityTests}가 막는다.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Payment")
package com.donworry.payment;
