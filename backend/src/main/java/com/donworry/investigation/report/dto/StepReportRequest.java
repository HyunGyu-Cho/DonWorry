package com.donworry.investigation.report.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

// ai-server → Spring 조사 단계 알림 (2-19b) — ai-server app/schemas/investigation.py TraceStep과 같은 칸
// kind: LLM_ANSWER(AI 판단) · VALIDATION(형식 검사). Spring이 화면 단계 종류로 바꿔 기록한다
public record StepReportRequest(
        UUID attemptId, String kind, Boolean ok, String detail, OffsetDateTime startedAt, Integer durationMs) {}
