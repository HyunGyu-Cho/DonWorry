package com.donworry.investigation.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

// 화면 조회 응답 (#82) — 화면 types의 ApprovalRequest · HandoffRow · FdsEvaluationSummary와 같은 모양
public final class InvestigationViewDtos {

    private InvestigationViewDtos() {}

    public record ApprovalResponse(
            Long approvalId,
            String requestType,
            String targetType,
            Long targetId,
            String targetLabel,
            Map<String, Object> payload,
            String reason,
            Long requestedBy,
            String requestedByName,
            Instant requestedAt,
            String status,
            Long decidedBy,
            Instant decidedAt,
            String decisionComment,
            Instant expiresAt,
            List<Long> riskStaffHitIds) {}

    // 조치 센터 한 줄 — 인계 + 사건 · 결제 표시 정보
    public record HandoffRowResponse(
            Long handoffId,
            Long decisionId,
            String actionType,
            String status,
            Long targetOperationId,
            Instant requestedAt,
            Instant acceptedAt,
            String lastErrorCode,
            Long caseId,
            String subjectLabel,
            Long paymentId,
            String paymentTitle,
            Long amount,
            String paymentStatus) {}

    // 결제 경보 한 줄 — P2 평가 + P5 결제 + P3 사건 (fds는 결제 · 사건을 모르므로 여기서 합친다)
    public record PaymentAlertSummary(
            Long evaluationId,
            Long paymentId,
            String customerRef,
            Integer riskScore,
            String result,
            Instant evaluatedAt,
            String errorCode,
            Instant paymentRequestedAt,
            Long amount,
            String orderTitle,
            String customerLabel,
            List<String> hitRuleCodes,
            String caseId) {}

    public record PaymentAlertPage(
            List<PaymentAlertSummary> content,
            int page,
            int size,
            long totalElements,
            int totalPages,
            Map<String, Long> resultCounts) {}

    public record PaymentAlertDetail(
            PaymentAlertSummary evaluation, List<?> ruleHits, List<PaymentAlertSummary> history) {}
}
