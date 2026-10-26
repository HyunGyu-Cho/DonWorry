package com.donworry.investigation.report.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

// 화면 types/report.ts ReportRun과 같은 모양 — 사건의 최신 조사 상태
// status: RUNNING · SUCCEEDED · FAILED (생성 대기도 화면에는 조사 중으로). steps는 2-19b에서 채운다
public record ReportRunResponse(
        String caseId,
        int reportVersion,
        String status,
        Instant startedAt,
        Instant finishedAt,
        List<Map<String, Object>> steps,
        Integer currentStepNo) {}
