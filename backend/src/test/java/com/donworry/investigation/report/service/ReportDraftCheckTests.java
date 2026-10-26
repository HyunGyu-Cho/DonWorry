package com.donworry.investigation.report.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.donworry.investigation.service.PaymentInfoReader.PaymentInfo;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.assertj.core.api.InstanceOfAssertFactories;
import org.junit.jupiter.api.Test;

// AI가 쓴 칸을 Spring이 다시 검사하고, 화면 결론 카드로 합치는 규칙 — DB 없이 확인한다
class ReportDraftCheckTests {

    static final ReportTarget FRAUD = new ReportTarget(7L, 201L, "PAYMENT_FRAUD", 2, 3);
    static final Set<Long> CASE_PAYMENTS = Set.of(31L, 32L);

    // ai-server 가짜 AI의 결제 사기 답과 같은 모양
    static Map<String, Object> fraudDraft() {
        Map<String, Object> draft = new HashMap<>();
        draft.put("reportType", "PAYMENT_FRAUD");
        draft.put("riskScore", 78);
        draft.put("verdict", "카드 도용 가능성이 있어 본인 확인이 필요합니다");
        draft.put("summary", "처음 쓰는 카드로 평소의 16배 금액을 결제했습니다.");
        draft.put("recommendations", List.of(Map.of("label", "승인 취소 검토", "kind", "NEGATIVE")));
        draft.put(
                "riskPoints",
                List.of(Map.of("title", "처음 쓰는 카드", "detail", "결제 완료 이력 없음", "source", "get_fds_evidence")));
        draft.put("normalPoints", List.of());
        draft.put("unknowns", List.of("구매자 본인의 결제 의사"));
        draft.put("checks", List.of("구매자 본인 확인 응답"));
        draft.put(
                "paymentAdvice",
                List.of(Map.of("paymentId", "31", "recommendation", "NEEDS_CHECK", "reason", "본인 확인 전")));
        return draft;
    }

    // 사건 종류 · 칸 · 결제 번호가 모두 맞으면 문제 없음
    @Test
    void problem_validFraudDraft_none() {
        assertThat(ReportDraftCheck.problem(FRAUD, fraudDraft(), CASE_PAYMENTS)).isEmpty();
    }

    // 결제별 권고에 사건에 없는 결제 번호가 있으면 실패 — ai-server는 사건 결제 목록을 모르므로 Spring이 막는다
    @Test
    void problem_paymentNotInCase_fails() {
        Map<String, Object> draft = fraudDraft();
        draft.put("paymentAdvice", List.of(Map.of("paymentId", "999", "recommendation", "NEEDS_CHECK", "reason", "x")));

        assertThat(ReportDraftCheck.problem(FRAUD, draft, CASE_PAYMENTS)).contains("사건에 없는 결제 번호가 있음");
    }

    // 사건 종류가 다르거나 · 필수 칸이 빠지거나 · 위험도가 범위 밖이면 실패
    @Test
    void problem_wrongTypeMissingOrOutOfRange_fails() {
        Map<String, Object> otherType = fraudDraft();
        otherType.put("reportType", "STAFF_SPRAY");
        Map<String, Object> noChecks = fraudDraft();
        noChecks.remove("checks");
        Map<String, Object> score = fraudDraft();
        score.put("riskScore", 120);

        assertThat(ReportDraftCheck.problem(FRAUD, otherType, CASE_PAYMENTS))
                .hasValueSatisfying(reason -> assertThat(reason).startsWith("사건 종류가 다름"));
        assertThat(ReportDraftCheck.problem(FRAUD, noChecks, CASE_PAYMENTS)).contains("필수 항목 'checks' 누락");
        assertThat(ReportDraftCheck.problem(FRAUD, score, CASE_PAYMENTS)).contains("위험도가 0~100이 아님");
        assertThat(ReportDraftCheck.problem(FRAUD, null, CASE_PAYMENTS)).contains("보고서 본문 없음");
    }

    // 결제 사건이 아닌데 결제별 권고가 있으면 실패
    @Test
    void problem_staffCaseWithPaymentAdvice_fails() {
        ReportTarget staff = new ReportTarget(8L, 101L, "STAFF_TAKEOVER", 1, 1);
        Map<String, Object> draft = fraudDraft();
        draft.put("reportType", "STAFF_TAKEOVER");

        assertThat(ReportDraftCheck.problem(staff, draft, Set.of())).contains("결제 사건이 아닌데 결제별 권고가 있음");
        draft.remove("paymentAdvice");
        assertThat(ReportDraftCheck.problem(staff, draft, Set.of())).isEmpty();
    }

    // 화면 결론 카드 모양으로 합친다 — AI 칸 그대로 + 사건 번호 · 버전 · 결제 금액 · 조사 과정, 모르는 칸은 빈 목록
    @Test
    void build_fraudDraft_conclusionReportShape() {
        Instant at = Instant.parse("2026-10-26T09:00:00Z");
        PaymentInfo payment = new PaymentInfo(31L, 650_000L, "HELD", at, 55, "REVIEW", List.of("HIGH_AMOUNT"));
        List<Map<String, Object>> steps = List.of(
                Map.of(
                        "kind",
                        "LLM_ANSWER",
                        "ok",
                        true,
                        "detail",
                        "AI 판단 (1차)",
                        "startedAt",
                        at.toString(),
                        "durationMs",
                        1500),
                Map.of(
                        "kind",
                        "VALIDATION",
                        "ok",
                        false,
                        "detail",
                        "구조 검증 실패: 필수 항목 '확인할 것' 누락 → 다시 시도",
                        "startedAt",
                        at.toString(),
                        "durationMs",
                        0),
                Map.of(
                        "kind",
                        "VALIDATION",
                        "ok",
                        true,
                        "detail",
                        "구조 검증 통과",
                        "startedAt",
                        at.toString(),
                        "durationMs",
                        0));

        Map<String, Object> body = ConclusionReportBuilder.build(FRAUD, fraudDraft(), steps, Map.of(31L, payment), at);

        assertThat(body)
                .containsEntry("schemaVersion", 2)
                .containsEntry("reportType", "PAYMENT_FRAUD")
                .containsEntry("caseId", "201")
                .containsEntry("reportVersion", 2)
                .containsEntry("generatedAt", "2026-10-26T09:00:00Z")
                .containsEntry("riskScore", 78)
                .containsEntry("timeline", List.of())
                .containsEntry("evidence", List.of())
                .containsEntry("similarCases", List.of())
                .containsKeys("verdict", "summary", "recommendations", "riskPoints", "checks", "limitations", "model");
        assertThat(body.get("paymentRecommendations"))
                .asInstanceOf(InstanceOfAssertFactories.LIST)
                .singleElement()
                .isEqualTo(Map.of(
                        "paymentId", "31",
                        "label", "결제 1",
                        "amount", 650_000L,
                        "recommendation", "NEEDS_CHECK",
                        "reason", "본인 확인 전"));
        // Map<?, ?>에서 꺼낸 값은 타입을 모르므로 Object 목록에 직접 담아 비교한다
        List<Object> kinds = new ArrayList<>();
        for (Object step : (List<?>) body.get("trace")) {
            kinds.add(((Map<?, ?>) step).get("kind"));
        }
        assertThat(kinds).containsExactly("LLM", "LLM_FAILED", "VALIDATE");
    }

    // 직원 사건은 결제별 권고 칸을 비운다 (null)
    @Test
    void build_staffDraft_noPaymentRecommendations() {
        ReportTarget staff = new ReportTarget(8L, 101L, "STAFF_TAKEOVER", 1, 1);
        Map<String, Object> draft = fraudDraft();
        draft.put("reportType", "STAFF_TAKEOVER");
        draft.remove("paymentAdvice");

        Map<String, Object> body = ConclusionReportBuilder.build(staff, draft, null, Map.of(), Instant.now());

        assertThat(body).containsEntry("paymentRecommendations", null).containsEntry("trace", List.of());
    }
}
