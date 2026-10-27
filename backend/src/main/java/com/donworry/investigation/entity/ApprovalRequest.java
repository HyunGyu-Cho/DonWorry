package com.donworry.investigation.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

// 2인 승인 요청 (approval_requests) — 지금은 읽기만. 요청 · 승인은 2-10
@Entity
@Table(name = "approval_requests")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ApprovalRequest {

    @Id
    @Column(name = "approval_id")
    private Long id;

    @Column(name = "request_type", nullable = false, length = 40)
    private String requestType;

    @Column(name = "target_type", nullable = false, length = 40)
    private String targetType;

    @Column(name = "target_id", nullable = false)
    private Long targetId;

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
}
