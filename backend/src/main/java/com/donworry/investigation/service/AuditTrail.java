package com.donworry.investigation.service;

import com.donworry.investigation.entity.AuditLog;
import com.donworry.investigation.repository.AuditLogRepository;
import java.time.Instant;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

// 감사 로그 남기기 (#102) — 업무 저장과 같은 트랜잭션에 넣어, 업무가 롤백되면 로그도 남지 않는다
@Service
@RequiredArgsConstructor
public class AuditTrail {

    public static final String STAFF = "STAFF";

    private final AuditLogRepository auditLogRepository;

    @Transactional
    public void staff(Long actorId, String action, String targetType, Long targetId, Map<String, Object> detail) {
        auditLogRepository.save(
                AuditLog.of(STAFF, actorId, action, targetType, targetId, detail, requestIp(), Instant.now()));
    }

    // 다른 모듈 이벤트(커밋 뒤)에서 부를 때 — 새 트랜잭션
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void staffAfterCommit(
            Long actorId,
            String action,
            String targetType,
            Long targetId,
            Map<String, Object> detail,
            String clientIp,
            Instant occurredAt) {
        auditLogRepository.save(
                AuditLog.of(STAFF, actorId, action, targetType, targetId, detail, clientIp, occurredAt));
    }

    // 커밋 뒤 리스너도 같은 요청 스레드에서 돌면 요청 IP를 읽을 수 있다. 요청 밖이면 null
    static String requestIp() {
        return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes
                ? attributes.getRequest().getRemoteAddr()
                : null;
    }
}
