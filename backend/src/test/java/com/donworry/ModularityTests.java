package com.donworry;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

/**
 * 모듈 경계 구조 테스트.
 *
 * <p>다른 모듈의 내부 패키지(repository/·entity/ 등) 직접 참조와 모듈 간 순환 의존을
 * 빌드 단계에서 잡는다. 허용된 호출은 각 모듈의 {@code api} 패키지와
 * Spring Modulith 이벤트뿐이다.
 */
class ModularityTests {

    static final ApplicationModules MODULES = ApplicationModules.of(DonWorryApplication.class);

    @Test
    void 모듈_경계를_위반하지_않는다() {
        MODULES.verify();
    }

    @Test
    void 모듈_구조를_출력한다() {
        MODULES.forEach(System.out::println);
    }
}
