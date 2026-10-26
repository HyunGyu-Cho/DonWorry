package com.donworry.investigation.report.service;

import com.donworry.investigation.report.dto.ToolCallRequest;
import com.donworry.investigation.report.dto.ToolResponse;
import com.donworry.investigation.report.entity.AiReportStep;
import com.donworry.investigation.report.repository.AiReportStepRepository;
import com.donworry.investigation.service.PaymentInfoReader;
import com.donworry.investigation.service.PaymentInfoReader.PaymentInfo;
import java.text.NumberFormat;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

// AI 증거 조회 창구 (2-19, ADR-0009 Tool 표) — 조사 중인 보고서의 현재 시도만, 그 사건 범위의 데이터만 준다
// 부를 때마다 조회 기록(ai_report_steps)을 한 줄 남기고, 보고서가 끝나면 trace로 요약해 넣는다
@Service
@RequiredArgsConstructor
public class ReportToolService {

    static final String NOT_READY_NOTE = "데이터 준비 전";

    private final ReportTransitions reportTransitions;
    private final AttemptRegistry attemptRegistry;
    private final PaymentInfoReader paymentInfoReader;
    private final AiReportStepRepository aiReportStepRepository;

    public ToolResponse call(String toolName, ToolCallRequest request) {
        ReportTool tool =
                ReportTool.of(toolName).orElseThrow(() -> new ReportException(ReportErrorCode.TOOL_NOT_FOUND));
        ReportTarget target = currentTarget(request);
        Instant startedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        long clock = System.nanoTime();
        Answer answer = answer(tool, target, request.args() == null ? Map.of() : request.args());
        int durationMs = (int) ((System.nanoTime() - clock) / 1_000_000);
        record(target.reportId(), request.attemptId(), tool, answer.summary(), startedAt, durationMs);
        String note = tool.ready() ? null : NOT_READY_NOTE;
        return new ToolResponse(tool.toolName(), tool.ready(), note, answer.data());
    }

    // 이 시도의 조회 기록 → 화면 ReportStep 모양 (보고서 trace에 앞부분으로 들어간다)
    public List<Map<String, Object>> traceRows(Long reportId, UUID attemptId) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (AiReportStep step :
                aiReportStepRepository.findByReportIdAndAttemptIdOrderByStepNoAsc(reportId, attemptId.toString())) {
            ReportTool tool = ReportTool.of(step.getToolName()).orElse(null);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("kind", AiReportStep.KIND_TOOL);
            row.put("label", tool != null ? tool.label() : step.getToolName());
            row.put("toolName", step.getToolName());
            row.put("startedAt", step.getStartedAt().toString());
            row.put("durationMs", step.getDurationMs());
            row.put("asked", tool != null ? tool.label() : step.getToolName());
            row.put("got", step.getSummary());
            row.put("status", step.isOk() ? "DONE" : "FAILED");
            rows.add(row);
        }
        return rows;
    }

    // 조사 중(PENDING · RUNNING)이고 현재 시도일 때만 — 끝났거나 대체된 보고서 · 옛 시도는 거절
    private ReportTarget currentTarget(ToolCallRequest request) {
        if (request.reportId() == null
                || !attemptRegistry.isCurrent(request.reportId(), request.attemptId())
                || reportTransitions.isFinished(request.reportId())) {
            throw new ReportException(ReportErrorCode.NOT_CURRENT_ATTEMPT);
        }
        return reportTransitions
                .target(request.reportId())
                .orElseThrow(() -> new ReportException(ReportErrorCode.NOT_CURRENT_ATTEMPT));
    }

    private record Answer(List<Map<String, Object>> data, String summary) {}

    private Answer answer(ReportTool tool, ReportTarget target, Map<String, Object> args) {
        return switch (tool) {
            case GET_CASE_PAYMENTS -> casePayments(target);
            case GET_FDS_EVIDENCE -> fdsEvidence(target, args);
            default -> new Answer(List.of(), NOT_READY_NOTE);
        };
    }

    private Answer casePayments(ReportTarget target) {
        List<Map<String, Object>> rows = new ArrayList<>();
        long total = 0;
        for (Long paymentId : reportTransitions.casePaymentIds(target.caseId())) {
            Optional<PaymentInfo> info = paymentInfoReader.find(paymentId);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("paymentId", String.valueOf(paymentId));
            row.put("amount", info.map(PaymentInfo::amount).orElse(null));
            row.put("paymentStatus", info.map(PaymentInfo::paymentStatus).orElse(null));
            row.put(
                    "requestedAt",
                    info.map(i -> String.valueOf(i.requestedAt())).orElse(null));
            rows.add(row);
            total += info.map(PaymentInfo::amount).orElse(0L);
        }
        return new Answer(rows, "결제 " + rows.size() + "건 · 합계 " + won(total));
    }

    // paymentIds를 주면 그 결제만 (사건 결제가 아니면 거절), 없으면 사건 결제 전부
    private Answer fdsEvidence(ReportTarget target, Map<String, Object> args) {
        List<Long> casePayments = reportTransitions.casePaymentIds(target.caseId());
        List<Long> asked = paymentIdsArg(args.get("paymentIds")).orElse(casePayments);
        if (!casePayments.containsAll(asked)) {
            throw new ReportException(ReportErrorCode.PAYMENT_NOT_IN_CASE);
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        int maxScore = 0;
        List<String> rules = new ArrayList<>();
        for (Long paymentId : asked) {
            Optional<PaymentInfo> info = paymentInfoReader.find(paymentId);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("paymentId", String.valueOf(paymentId));
            row.put("riskScore", info.map(PaymentInfo::riskScore).orElse(null));
            row.put("fdsResult", info.map(PaymentInfo::fdsResult).orElse(null));
            row.put("ruleHits", info.map(PaymentInfo::ruleHits).orElse(List.of()));
            rows.add(row);
            maxScore = Math.max(maxScore, info.map(PaymentInfo::riskScore).orElse(0));
            info.map(PaymentInfo::ruleHits).orElse(List.of()).stream()
                    .filter(rule -> !rules.contains(rule))
                    .forEach(rules::add);
        }
        String summary = "결제 " + rows.size() + "건 · 최고 " + maxScore + "점"
                + (rules.isEmpty() ? "" : " · " + String.join(", ", rules));
        return new Answer(rows, summary);
    }

    private static Optional<List<Long>> paymentIdsArg(Object value) {
        if (!(value instanceof Collection<?> values)) {
            return Optional.empty();
        }
        List<Long> ids = new ArrayList<>();
        for (Object id : values) {
            try {
                ids.add(Long.valueOf(String.valueOf(id)));
            } catch (NumberFormatException e) {
                throw new ReportException(ReportErrorCode.PAYMENT_NOT_IN_CASE);
            }
        }
        return Optional.of(ids);
    }

    private void record(
            Long reportId, UUID attemptId, ReportTool tool, String summary, Instant startedAt, int durationMs) {
        int stepNo = aiReportStepRepository.countByReportId(reportId) + 1;
        aiReportStepRepository.save(AiReportStep.tool(
                reportId, attemptId.toString(), stepNo, tool.toolName(), true, summary, startedAt, durationMs));
    }

    private static String won(long amount) {
        return NumberFormat.getNumberInstance(Locale.KOREA).format(amount) + "원";
    }
}
