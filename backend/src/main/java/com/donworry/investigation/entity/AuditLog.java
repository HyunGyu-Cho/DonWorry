package com.donworry.investigation.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

// 감사 로그 한 줄 (audit_logs, #102) — 누가 · 언제 · 어디서 · 무엇을. 고치거나 지우지 않는다
@Entity
@Table(name = "audit_logs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "audit_id")
    private Long id;

    // STAFF · SYSTEM · AI
    @Column(name = "actor_type", nullable = false, length = 20)
    private String actorType;

    @Column(name = "actor_id")
    private Long actorId;

    @Column(name = "action", nullable = false, length = 60)
    private String action;

    @Column(name = "target_type", length = 40)
    private String targetType;

    @Column(name = "target_id")
    private Long targetId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "detail")
    private Map<String, Object> detail;

    @Column(name = "client_ip", length = 45)
    private String clientIp;

    @Column(name = "occurred_at", nullable = false, columnDefinition = "DATETIME(6)")
    private Instant occurredAt;

    public static AuditLog of(
            String actorType,
            Long actorId,
            String action,
            String targetType,
            Long targetId,
            Map<String, Object> detail,
            String clientIp,
            Instant occurredAt) {
        var log = new AuditLog();
        log.actorType = actorType;
        log.actorId = actorId;
        log.action = action;
        log.targetType = targetType;
        log.targetId = targetId;
        log.detail = detail;
        log.clientIp = clientIp;
        log.occurredAt = occurredAt;
        return log;
    }
}
