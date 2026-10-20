package com.donworry;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

// 모듈 경계·순환 의존 검사 — DB 없이 돈다
class ModularityTests {

    static final ApplicationModules modules = ApplicationModules.of(DonWorryApplication.class);

    @Test
    void 모듈_경계와_순환_의존을_검사한다() {
        modules.verify();
    }

    @Test
    void 모듈_관계도를_생성한다() {
        // build/spring-modulith-docs 에 모듈 다이어그램(PlantUML)이 생긴다
        new Documenter(modules).writeModulesAsPlantUml().writeIndividualModulesAsPlantUml();
    }
}
