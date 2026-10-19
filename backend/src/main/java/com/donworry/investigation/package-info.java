/**
 * HELD 결제의 Case 연결 보장·통합 조사·AI 결과 관리·결제별 판정 이벤트 (Notion 02-1).
 *
 * <p>담당: 수민
 *
 * <p>다른 모듈에서 쓸 수 있는 것은 {@code investigation.api} 패키지뿐이다.
 * 이 모듈의 {@code repository}·{@code entity}를 다른 모듈이 직접 참조하면
 * {@code ModularityTests}가 막는다.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Investigation")
package com.donworry.investigation;
