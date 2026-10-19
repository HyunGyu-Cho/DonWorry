/**
 * 매입·정산·환불·자금관리(cashflow) (Notion 02-1).
 *
 * <p>담당: 민정
 *
 * <p>다른 모듈이 읽어야 할 공개 계약이 아직 없어 {@code api} 패키지를 두지 않았다.
 * 필요해지면 그때 만든다. 이 모듈은 {@code payment.api}의 PaymentReader 만 조회한다 (Notion 05-2).
 */
@org.springframework.modulith.ApplicationModule(displayName = "Settlement")
package com.donworry.settlement;
