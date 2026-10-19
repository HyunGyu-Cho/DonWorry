/**
 * DonWorry 인증·계정·가맹점·권한 (Notion 02-1).
 *
 * <p>담당: 주환
 *
 * <p>다른 모듈에서 쓸 수 있는 것은 {@code identity.api} 패키지뿐이다.
 * 이 모듈의 {@code repository}·{@code entity}를 다른 모듈이 직접 참조하면
 * {@code ModularityTests}가 막는다.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Identity")
package com.donworry.identity;
