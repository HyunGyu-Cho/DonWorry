package com.donworry.investigation.report.service;

import com.donworry.investigation.report.entity.AiReportStep;
import com.donworry.investigation.report.repository.AiReportStepRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// AI 조사 과정 기록 (ai_report_steps) — 접수 · 증거 조회 · AI 판단 · 형식 검사 · 저장을 한 줄씩 쌓는다 (2-19 · 2-19b)
// 조사 중에는 화면 진행 상태(report/run)로, 끝나면 보고서 trace로 같은 기록을 보여 준다
@Service
@RequiredArgsConstructor
public class ReportStepRecorder {

    public static final String REQUEST = "REQUEST";
    public static final String RETRY = "RETRY";
    public static final String LLM = "LLM";
    public static final String LLM_FAILED = "LLM_FAILED";
    public static final String VALIDATE = "VALIDATE";
    public static final String SAVE = "SAVE";
    // ai-server가 알려 주는 단계 — 하나도 없으면 결과에 실려 온 steps로 대신한다
    static final Set<String> AI_SERVER_KINDS = Set.of(LLM, LLM_FAILED, VALIDATE);

    private final AiReportStepRepository aiReportStepRepository;

    public void tool(
            Long reportId, UUID attemptId, ReportTool tool, String summary, Instant startedAt, int durationMs) {
        int stepNo = aiReportStepRepository.countByReportId(reportId) + 1;
        aiReportStepRepository.save(AiReportStep.tool(
                reportId, attemptId.toString(), stepNo, tool.toolName(), true, summary, micros(startedAt), durationMs));
    }

    // 접수 기록은 P3 커밋 직후(이미 끝난 트랜잭션 안)에서 불린다 — 따로 커밋해야 남는다
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void step(
            Long reportId, UUID attemptId, String kind, boolean ok, String summary, Instant startedAt, int durationMs) {
        int stepNo = aiReportStepRepository.countByReportId(reportId) + 1;
        aiReportStepRepository.save(AiReportStep.of(
                reportId, attemptId.toString(), stepNo, kind, ok, summary, micros(startedAt), durationMs));
    }

    public boolean hasAiServerSteps(Long reportId) {
        return aiReportStepRepository.existsByReportIdAndKindIn(reportId, AI_SERVER_KINDS);
    }

    // 한 보고서의 기록 전체(모든 시도)를 시작 시각 순으로 → 화면 ReportStep 모양
    public List<Map<String, Object>> rows(Long reportId) {
        List<AiReportStep> steps = new ArrayList<>(aiReportStepRepository.findByReportIdOrderByStepNoAsc(reportId));
        steps.sort(Comparator.comparing(AiReportStep::getStartedAt).thenComparingInt(AiReportStep::getStepNo));
        List<Map<String, Object>> rows = new ArrayList<>();
        for (AiReportStep step : steps) {
            rows.add(row(rows.size() + 1, step));
        }
        return rows;
    }

    private static Map<String, Object> row(int stepNo, AiReportStep step) {
        ReportTool tool = step.getToolName() == null
                ? null
                : ReportTool.of(step.getToolName()).orElse(null);
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("stepNo", stepNo);
        row.put("kind", step.getKind());
        row.put("label", label(step, tool));
        row.put("toolName", step.getToolName());
        row.put("startedAt", step.getStartedAt().toString());
        row.put("durationMs", step.getDurationMs());
        row.put("asked", asked(step, tool));
        row.put("got", step.getSummary());
        row.put("status", step.isOk() ? "DONE" : "FAILED");
        return row;
    }

    private static String label(AiReportStep step, ReportTool tool) {
        return switch (step.getKind()) {
            case AiReportStep.KIND_TOOL -> tool != null ? tool.label() : step.getToolName();
            case REQUEST -> "조사 요청 접수";
            case RETRY -> "직원이 다시 조사 요청";
            case SAVE -> "보고서 저장";
            default -> step.getSummary();
        };
    }

    private static String asked(AiReportStep step, ReportTool tool) {
        return switch (step.getKind()) {
            case AiReportStep.KIND_TOOL -> tool != null ? tool.label() : step.getToolName();
            case REQUEST -> "사건이 생기자 Spring이 ai-server에 조사를 맡김";
            case RETRY -> "AI 조사가 실패해 직원이 [AI 조사 다시 하기]를 누름";
            case LLM -> "증거를 보고 판단 요청";
            case SAVE -> "검사를 통과한 보고서를 저장";
            default -> "보고서 형식 검사";
        };
    }

    // DATETIME(6)에 저장되는 값과 같게 마이크로초로 맞춘다
    private static Instant micros(Instant at) {
        return at.truncatedTo(ChronoUnit.MICROS);
    }
}
