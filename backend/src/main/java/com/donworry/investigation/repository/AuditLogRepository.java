package com.donworry.investigation.repository;

import com.donworry.investigation.entity.AuditLog;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

// 감사 로그는 쌓고 읽기만 한다 (수정 · 삭제 메서드 없음)
public interface AuditLogRepository extends Repository<AuditLog, Long> {

    AuditLog save(AuditLog log);

    // 조건이 null이면 그 조건은 보지 않는다. 최신이 앞
    @Query("""
            SELECT a FROM AuditLog a
            WHERE (:actorId IS NULL OR a.actorId = :actorId)
              AND (:action IS NULL OR a.action = :action)
              AND (:from IS NULL OR a.occurredAt >= :from)
              AND (:to IS NULL OR a.occurredAt < :to)
            ORDER BY a.occurredAt DESC, a.id DESC
            """)
    List<AuditLog> search(
            @Param("actorId") Long actorId,
            @Param("action") String action,
            @Param("from") Instant from,
            @Param("to") Instant to,
            Pageable page);
}
