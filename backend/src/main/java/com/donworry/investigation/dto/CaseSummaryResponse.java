package com.donworry.investigation.dto;

import java.time.Instant;
import java.util.List;

// Case 목록 한 줄 — 화면 CaseSummary와 같은 모양
public record CaseSummaryResponse(
        Long caseId,
        Long merchantId,
        String customerRef,
        String caseType,
        String status,
        int evidenceVersion,
        Instant createdAt,
        Instant closedAt,
        int paymentCount,
        // 결제 정보를 하나라도 조회하지 못하면 null — 일부만 더한 값을 합계로 내보내지 않는다
        Long totalAmount,
        Integer maxRiskScore,
        String latestReportStatus,
        int decidedCount,
        // #82: 화면용 대상 이름 · 묶은 기준 · 묶인 결제의 적중 Rule (중복 없이, 점수 큰 순)
        String subjectLabel,
        String groupingBasis,
        List<String> hitRuleCodes) {}
