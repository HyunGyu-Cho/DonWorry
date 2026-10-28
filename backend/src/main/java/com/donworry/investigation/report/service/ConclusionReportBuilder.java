package com.donworry.investigation.report.service;

import com.donworry.investigation.service.PaymentInfoReader.PaymentInfo;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// AI가 쓴 칸 + Spring이 아는 사실 → 화면 결론 카드(frontend/src/types/report.ts ConclusionReport, schemaVersion 2)
// 모르는 칸은 지어내지 않고 빈 목록으로 둔다 — 경위 · 증거는 아직 비움. 비슷한 사건은 Spring이 찾아 채운다 (#104 2-9a)
final class ConclusionReportBuilder {

    static final List<String> LIMITATIONS =
            List.of("AI 보고서는 참고용이며 최종 판정은 직원이 합니다.", "위험도는 부정거래 확률이 아닙니다.", "사건 경위 · 증거 목록은 아직 자동으로 채우지 않습니다.");

    private ConclusionReportBuilder() {}

    static Map<String, Object> build(
            ReportTarget target,
            Map<String, Object> draft,
            List<Map<String, Object>> steps,
            Map<Long, PaymentInfo> payments,
            Instant generatedAt) {
        return build(target, draft, steps, List.of(), payments, List.of(), generatedAt);
    }

    // recordedRows = 조사 과정 기록 전체 (ReportStepRecorder.rows — 접수 · 증거 조회 · AI 판단 · 검사 · 저장, 2-19b)
    // steps = ai-server 결과에 실려 온 과정 — 단계 알림이 하나도 기록되지 않았을 때만 넘긴다 (아니면 null)
    // similarCases = 저장 시점의 비슷한 과거 사건 (SimilarCaseService) — AI가 쓴 칸이 아니라 Spring이 아는 사실
    static Map<String, Object> build(
            ReportTarget target,
            Map<String, Object> draft,
            List<Map<String, Object>> steps,
            List<Map<String, Object>> recordedRows,
            Map<Long, PaymentInfo> payments,
            List<Map<String, Object>> similarCases,
            Instant generatedAt) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("schemaVersion", 2);
        body.put("reportType", target.caseType());
        body.put("caseId", String.valueOf(target.caseId()));
        body.put("reportVersion", target.reportVersion());
        body.put("generatedAt", generatedAt.toString());
        for (String key : List.of(
                "riskScore",
                "verdict",
                "summary",
                "recommendations",
                "riskPoints",
                "normalPoints",
                "unknowns",
                "checks")) {
            Object value = draft.get(key);
            body.put(key, value != null ? value : List.of());
        }
        body.put("timeline", List.of());
        body.put("paymentRecommendations", paymentRecommendations(target, draft, payments));
        body.put("evidence", List.of());
        body.put("similarCases", similarCases);
        body.put("trace", trace(steps, recordedRows));
        body.put("limitations", LIMITATIONS);
        body.put("model", "ai-server");
        return body;
    }

    // 결제 사건만 — AI 권고 · 이유 + Spring이 아는 금액. 결제 이름은 화면 문장에 번호 대신 순서로
    private static List<Map<String, Object>> paymentRecommendations(
            ReportTarget target, Map<String, Object> draft, Map<Long, PaymentInfo> payments) {
        if (!"PAYMENT_FRAUD".equals(target.caseType())
                || !(draft.get("paymentAdvice") instanceof Collection<?> advice)) {
            return null;
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        int order = 0;
        for (Object item : advice) {
            Map<?, ?> map = (Map<?, ?>) item;
            Long paymentId = ReportDraftCheck.parseId(map.get("paymentId"));
            PaymentInfo info = payments.get(paymentId);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("paymentId", String.valueOf(paymentId));
            row.put("label", "결제 " + (++order));
            row.put("amount", info != null ? info.amount() : null);
            row.put("recommendation", map.get("recommendation"));
            row.put("reason", map.get("reason"));
            rows.add(row);
        }
        return rows;
    }

    // ai-server 조사 과정 → 화면 ReportStep. 형식 검사에 떨어진 단계는 LLM_FAILED (다시 쓰는 단계)
    // 기록된 단계와 (있으면) ai-server 과정을 시작 시각 순으로 섞고 번호를 다시 매긴다
    private static List<Map<String, Object>> trace(
            List<Map<String, Object>> steps, List<Map<String, Object>> recordedRows) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> tool : recordedRows) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("stepNo", 0);
            row.putAll(tool);
            rows.add(row);
        }
        rows.addAll(aiServerTrace(steps));
        rows.sort(Comparator.comparing(row -> startedAt(row.get("startedAt"))));
        for (int i = 0; i < rows.size(); i++) {
            rows.get(i).put("stepNo", i + 1);
        }
        return rows;
    }

    // ai-server는 +00:00, Spring은 Z로 시각을 쓴다 — 둘 다 읽고 못 읽으면 맨 뒤로
    private static Instant startedAt(Object value) {
        try {
            return OffsetDateTime.parse(String.valueOf(value)).toInstant();
        } catch (DateTimeParseException e) {
            return Instant.MAX;
        }
    }

    private static List<Map<String, Object>> aiServerTrace(List<Map<String, Object>> steps) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (steps == null) {
            return rows;
        }
        int stepNo = 0;
        for (Map<String, Object> step : steps) {
            boolean ok = Boolean.TRUE.equals(step.get("ok"));
            boolean validation = "VALIDATION".equals(step.get("kind"));
            String kind = validation ? (ok ? "VALIDATE" : "LLM_FAILED") : "LLM";
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("stepNo", ++stepNo);
            row.put("kind", kind);
            row.put("label", step.get("detail"));
            row.put("toolName", null);
            row.put("startedAt", step.get("startedAt"));
            row.put("durationMs", step.get("durationMs"));
            row.put("asked", validation ? "보고서 형식 검사" : "사건 조사 보고서 작성");
            row.put("got", step.get("detail"));
            row.put("status", ok ? "DONE" : "FAILED");
            rows.add(row);
        }
        return rows;
    }
}
