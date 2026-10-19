package com.donworry;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

/**
 * 06-3: Spring Modulith 가 보지 않는 계층 규칙을 ArchUnit 으로 막는다.
 * 모듈 경계(다른 모듈의 repository·entity 직접 참조)는 {@link ModularityTests} 가 담당한다.
 *
 * <p>구현 전이라 해당 패키지가 비어 있을 수 있어 {@code allowEmptyShould(true)} 를 둔다.
 * 클래스가 생기면 규칙이 그대로 적용된다.
 */
class ArchitectureTests {

    private static final JavaClasses CLASSES = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.donworry");

    @Test
    void controller_는_repository_를_직접_호출하지_않는다() {
        ArchRule rule = noClasses()
                .that()
                .resideInAPackage("..controller..")
                .should()
                .dependOnClassesThat()
                .resideInAPackage("..repository..")
                .because("Controller → Service/api → Repository 순서를 지킨다 (06-1)");

        rule.allowEmptyShould(true).check(CLASSES);
    }

    @Test
    void controller_는_entity_를_노출하지_않는다() {
        ArchRule rule = noClasses()
                .that()
                .resideInAPackage("..controller..")
                .should()
                .dependOnClassesThat()
                .resideInAPackage("..entity..")
                .because("화면·외부로는 DTO 만 내보낸다 (02-1)");

        rule.allowEmptyShould(true).check(CLASSES);
    }

    /**
     * ADR-0003: investigation 은 payment 에 Java 로 의존하지 않는다.
     *
     * <p>{@code payment → investigation.api} 방향은 C03 호출과 CaseDecisionMade 이벤트 타입
     * 수신으로 유지된다. 역방향이 생기면 Modulith 가 모듈 간선을 집계해 순환으로 판정하므로
     * {@code ApplicationModules.verify()} 가 실패한다. 그 전에 여기서 원인을 가리키고 막는다.
     *
     * <p>SEC-01·02 화면이 쓰는 결제 사실은 C03 요청이 넘긴 값을 {@code case_payments} 에
     * 스냅샷으로 둔 것을 쓴다. PaymentReader 를 다시 끌어오지 않는다.
     */
    @Test
    void investigation_은_payment_에_의존하지_않는다() {
        ArchRule rule = noClasses()
                .that()
                .resideInAPackage("com.donworry.investigation..")
                .should()
                .dependOnClassesThat()
                .resideInAPackage("com.donworry.payment..")
                .because("ADR-0003 — 역방향이 생기면 investigation ↔ payment 순환이 된다");

        rule.allowEmptyShould(true).check(CLASSES);
    }

    @Test
    void entity_는_controller_나_service_에_의존하지_않는다() {
        ArchRule rule = noClasses()
                .that()
                .resideInAPackage("..entity..")
                .should()
                .dependOnClassesThat()
                .resideInAnyPackage("..controller..", "..service..")
                .because("영속 모델이 상위 계층을 역참조하지 않는다");

        rule.allowEmptyShould(true).check(CLASSES);
    }
}
