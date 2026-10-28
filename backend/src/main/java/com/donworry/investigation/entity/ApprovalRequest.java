package com.donworry.investigation.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

// 관리자 승인 요청 (approval_requests, #102) — 요청자 본인은 승인할 수 없다 (DB CHECK로도 막음)
@Entity
@Table(name = "approval_requests")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ApprovalRequest {

    public static final String PENDING = "PENDING";
    public static final String APPROVED = "APPROVED";
    public static final String REJECTED = "REJECTED";
    public static final String EXPIRED = "EXPIRED";
    // 요청 뒤 이 시간이 지나면 처리할 수 없다
    public static final Duration VALID_FOR = Duration.ofHours(24);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "approval_id")
    private Long id;

    @Column(name = "request_type", nullable = false, length = 40)
    private String requestType;

    @Column(name = "target_type", nullable = false, length = 40)
    private String targetType;

    @Column(name = "target_id", nullable = false)
    private Long targetId;

    @Column(name = "target_label", length = 200)
    private String targetLabel;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload")
    private Map<String, Object> payload;

    @Column(name = "reason", nullable = false, length = 500)
    private String reason;

    @Column(name = "requested_by", nullable = false)
    private Long requestedBy;

    @Column(name = "requested_at", nullable = false, columnDefinition = "DATETIME(6)")
    private Instant requestedAt;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "decided_by")
    private Long decidedBy;

    @Column(name = "decided_at", columnDefinition = "DATETIME(6)")
    private Instant decidedAt;

    @Column(name = "decision_comment", length = 500)
    private String decisionComment;

    @Column(name = "expires_at", nullable = false, columnDefinition = "DATETIME(6)")
    private Instant expiresAt;

    public static ApprovalRequest create(
            String requestType,
            String targetType,
            Long targetId,
            String targetLabel,
            Map<String, Object> payload,
            String reason,
            Long requestedBy,
            Instant now) {
        var request = new ApprovalRequest();
        request.requestType = requestType;
        request.targetType = targetType;
        request.targetId = targetId;
        request.targetLabel = targetLabel;
        request.payload = payload;
        request.reason = reason;
        request.requestedBy = requestedBy;
        request.requestedAt = now;
        request.status = PENDING;
        request.expiresAt = now.plus(VALID_FOR);
        return request;
    }

    public boolean isOpen(Instant now) {
        return PENDING.equals(status) && expiresAt.isAfter(now);
    }

    // 기한이 지난 대기 요청은 화면에 "만료"로 보인다 (행은 처리 시도 때까지 그대로)
    public String displayStatus(Instant now) {
        return PENDING.equals(status) && !expiresAt.isAfter(now) ? EXPIRED : status;
    }

    public void decide(boolean approve, Long managerId, String comment, Instant now) {
        status = approve ? APPROVED : REJECTED;
        decidedBy = managerId;
        decidedAt = now;
        decisionComment = comment;
    }
}
