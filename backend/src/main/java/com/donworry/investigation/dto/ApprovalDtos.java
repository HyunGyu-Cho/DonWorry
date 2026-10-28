package com.donworry.investigation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.Map;

// 2인 승인 요청 만들기 · 처리 · 감사 로그 (#102) — 화면 types/investigation.ts와 같은 모양
public final class ApprovalDtos {

    private ApprovalDtos() {}

    public record NewApprovalRequest(
            @NotBlank String requestType,
            @NotBlank String targetType,
            @NotNull Long targetId,
            @Size(max = 200) String targetLabel,
            Map<String, Object> payload,
            @NotBlank @Size(min = 5, max = 500) String reason) {}

    // decision: APPROVE · REJECT, 거절이면 comment 필수
    public record ApprovalDecisionRequest(
            @NotBlank @Pattern(regexp = "APPROVE|REJECT") String decision,
            @Size(max = 500) String comment) {}

    // 화면 types/auth.ts IpInfo
    public record IpInfo(String address, String countryCode, String ipType, String label) {}

    public record AuditLogResponse(
            Long auditId,
            String actorType,
            Long actorId,
            String actorName,
            String action,
            String targetType,
            Long targetId,
            Map<String, Object> detail,
            String clientIp,
            IpInfo client,
            boolean suspiciousSession,
            Instant occurredAt) {}
}
