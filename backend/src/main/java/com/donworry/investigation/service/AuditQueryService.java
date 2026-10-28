package com.donworry.investigation.service;

import com.donworry.identity.api.IpLocator;
import com.donworry.identity.api.StaffDirectory;
import com.donworry.investigation.dto.ApprovalDtos.AuditLogResponse;
import com.donworry.investigation.dto.ApprovalDtos.IpInfo;
import com.donworry.investigation.entity.AuditLog;
import com.donworry.investigation.repository.AuditLogRepository;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 감사 로그 조회 (#102) — 보안 관리자만, 최신 200줄까지
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuditQueryService {

    static final int LIMIT = 200;

    private final AuditLogRepository auditLogRepository;
    private final StaffGuard staffGuard;
    private final StaffDirectory staffDirectory;
    private final IpLocator ipLocator;

    public List<AuditLogResponse> list(Long actorId, String action, Instant from, Instant to) {
        staffGuard.requireManager(InvestigationErrorCode.AUDIT_MANAGER_ONLY);
        return auditLogRepository.search(actorId, action, from, to, PageRequest.of(0, LIMIT)).stream()
                .map(this::response)
                .toList();
    }

    private AuditLogResponse response(AuditLog log) {
        String actorName = log.getActorId() == null
                ? actorTypeName(log.getActorType())
                : staffDirectory.displayName(log.getActorId()).orElse("직원");
        IpInfo client = log.getClientIp() == null
                ? null
                : ipLocator
                        .locate(log.getClientIp())
                        .map(ip -> new IpInfo(ip.ipAddress(), ip.countryCode(), ip.ipType(), ip.label()))
                        .orElse(null);
        // 탈취 의심 세션 표시는 직원 세션 감시(H단계)에서 채운다
        return new AuditLogResponse(
                log.getId(),
                log.getActorType(),
                log.getActorId(),
                actorName,
                log.getAction(),
                log.getTargetType(),
                log.getTargetId(),
                log.getDetail(),
                log.getClientIp(),
                client,
                false,
                log.getOccurredAt());
    }

    private static String actorTypeName(String actorType) {
        return switch (actorType) {
            case "AI" -> "AI";
            case "SYSTEM" -> "시스템";
            default -> "직원";
        };
    }
}
