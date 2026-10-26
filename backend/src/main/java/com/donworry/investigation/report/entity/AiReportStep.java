package com.donworry.investigation.report.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// AI 조사 과정 한 단계 (증거 조회 Tool 호출 등) — 화면 "AI가 조사한 과정"의 재료 (2-19)
// 원본 증거 · 질문 전문은 두지 않고 짧은 요약만. 조사 기록이라 고치거나 지우지 않는다
@Entity
@Table(name = "ai_report_steps")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiReportStep {

    public static final String KIND_TOOL = "TOOL";
    static final int SUMMARY_MAX = 200;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "step_id")
    private Long id;

    private Long reportId;

    // 몇 번째 시도의 단계인지 (UUID 문자열)
    private String attemptId;

    private int stepNo;

    private String kind;

    private String toolName;

    private boolean ok;

    private String summary;

    private Instant startedAt;

    private int durationMs;

    private AiReportStep(
            Long reportId,
            String attemptId,
            int stepNo,
            String kind,
            String toolName,
            boolean ok,
            String summary,
            Instant startedAt,
            int durationMs) {
        this.reportId = Objects.requireNonNull(reportId, "reportId");
        this.attemptId = Objects.requireNonNull(attemptId, "attemptId");
        this.stepNo = stepNo;
        this.kind = kind;
        this.toolName = toolName;
        this.ok = ok;
        // 요약이 길면 잘라 둔다 — 원본을 담는 칸이 아니다
        this.summary = summary.length() > SUMMARY_MAX ? summary.substring(0, SUMMARY_MAX - 1) + "…" : summary;
        this.startedAt = startedAt;
        this.durationMs = durationMs;
    }

    public static AiReportStep tool(
            Long reportId,
            String attemptId,
            int stepNo,
            String toolName,
            boolean ok,
            String summary,
            Instant startedAt,
            int durationMs) {
        return new AiReportStep(reportId, attemptId, stepNo, KIND_TOOL, toolName, ok, summary, startedAt, durationMs);
    }
}
