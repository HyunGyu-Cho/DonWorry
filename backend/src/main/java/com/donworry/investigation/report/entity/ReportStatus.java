package com.donworry.investigation.report.entity;

import java.util.EnumSet;
import java.util.Set;

// AI 보고서 상태 (fds 정본 03 §3.3 ④) — SUCCEEDED · FAILED는 끝난 상태
// 바꿔도 되는 방향은 ADR-0009 결정 2. 실제 변경은 AiReportRepository의 조건부 UPDATE가 같은 규칙으로 한다
public enum ReportStatus {
    PENDING,
    RUNNING,
    SUCCEEDED,
    FAILED;

    // 끝난 보고서는 어떤 경로로도 다시 바뀌지 않는다
    public boolean isFinished() {
        return this == SUCCEEDED || this == FAILED;
    }

    // 이 상태가 될 수 있는 이전 상태. 결과가 접수 응답(RUNNING)보다 먼저 올 수 있어 끝 상태는 PENDING에서도 된다
    public Set<ReportStatus> allowedFrom() {
        return switch (this) {
            case PENDING -> EnumSet.noneOf(ReportStatus.class);
            case RUNNING -> EnumSet.of(PENDING);
            case SUCCEEDED, FAILED -> EnumSet.of(PENDING, RUNNING);
        };
    }

    public boolean canBecome(ReportStatus next) {
        return next.allowedFrom().contains(this);
    }
}
