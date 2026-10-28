package com.donworry.investigation.service;

import com.donworry.fds.api.BlocklistRegistry;
import com.donworry.fds.api.FdsRuleSwitch;
import com.donworry.fds.api.TargetChange;
import com.donworry.investigation.dto.ApprovalDtos.ApprovalDecisionRequest;
import com.donworry.investigation.dto.ApprovalDtos.NewApprovalRequest;
import com.donworry.investigation.dto.InvestigationViewDtos.ApprovalResponse;
import com.donworry.investigation.entity.ApprovalRequest;
import com.donworry.investigation.repository.ApprovalRequestRepository;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 관리자 승인 요청 만들기 · 승인 · 거절 (#102, ADR-0024)
// 권고 반대 판정(DECISION_OVERRIDE)은 판정 API가 만들고, 여기서는 화면이 직접 요청하는 Rule 끄기 · 기준값 · 차단 해제만 만든다
// 승인하면 같은 트랜잭션에서 Rule을 끄고 차단을 푼다 (#104 2-7). 기준값 변경 반영은 아직 없음
@Service
@RequiredArgsConstructor
public class ApprovalCommandService {

    public static final String DECISION_OVERRIDE = "DECISION_OVERRIDE";
    static final String RULE_DISABLE = "RULE_DISABLE";
    static final String RULE_THRESHOLD = "RULE_THRESHOLD";
    static final String BLOCKLIST_RELEASE = "BLOCKLIST_RELEASE";
    // 화면이 직접 만들 수 있는 요청 종류 → 대상 종류
    static final Map<String, String> DIRECT_REQUESTS = Map.of(
            RULE_DISABLE, "FDS_RULE",
            RULE_THRESHOLD, "FDS_RULE",
            BLOCKLIST_RELEASE, "BLOCKLIST_ENTRY");
    static final String TARGET = "APPROVAL_REQUEST";

    private final ApprovalRequestRepository approvalRequestRepository;
    private final ApprovalQueryService approvalQueryService;
    private final StaffGuard staffGuard;
    private final AuditTrail auditTrail;
    private final ApplicationEventPublisher events;
    private final FdsRuleSwitch ruleSwitch;
    private final BlocklistRegistry blocklistRegistry;

    // 권고 반대 판정 승인 · 거절 → 판정 서비스가 같은 트랜잭션에서 사건에 반영 (서로 부르지 않게 이벤트로)
    public record OverrideDecided(ApprovalRequest request, boolean approved) {}

    @Transactional
    public ApprovalResponse create(NewApprovalRequest input) {
        var user = staffGuard.requireStaff();
        if (!input.targetType().equals(DIRECT_REQUESTS.get(input.requestType()))) {
            throw new InvestigationException(InvestigationErrorCode.INVALID_APPROVAL_REQUEST);
        }
        if (!targetRequestable(input.requestType(), input.targetId())) {
            throw new InvestigationException(InvestigationErrorCode.APPROVAL_TARGET_INVALID);
        }
        ApprovalRequest saved = open(
                input.requestType(),
                input.targetType(),
                input.targetId(),
                input.targetLabel(),
                input.payload(),
                input.reason().trim(),
                user.userId());
        return approvalQueryService.response(saved, Instant.now());
    }

    // 같은 대상에 처리 대기 요청은 하나만. 판정 API(권고 반대)도 이걸로 요청을 만든다
    @Transactional
    public ApprovalRequest open(
            String requestType,
            String targetType,
            Long targetId,
            String targetLabel,
            Map<String, Object> payload,
            String reason,
            Long requestedBy) {
        Instant now = Instant.now();
        if (approvalRequestRepository.existsByRequestTypeAndTargetTypeAndTargetIdAndStatusAndExpiresAtAfter(
                requestType, targetType, targetId, ApprovalRequest.PENDING, now)) {
            throw new InvestigationException(InvestigationErrorCode.APPROVAL_DUPLICATE);
        }
        ApprovalRequest saved = approvalRequestRepository.save(ApprovalRequest.create(
                requestType, targetType, targetId, targetLabel, payload, reason, requestedBy, now));
        auditTrail.staff(
                requestedBy,
                "APPROVAL_REQUESTED",
                TARGET,
                saved.getId(),
                Map.of("requestType", requestType, "targetType", targetType, "targetId", targetId));
        return saved;
    }

    // 검사 순서: 관리자인가 → 아직 처리 전 · 기한 안인가 → 본인 요청이 아닌가 → 거절이면 이유가 있는가
    @Transactional
    public ApprovalResponse decide(Long approvalId, ApprovalDecisionRequest input) {
        var manager = staffGuard.requireManager(InvestigationErrorCode.MANAGER_ONLY);
        ApprovalRequest request = approvalRequestRepository
                .findByIdForUpdate(approvalId)
                .orElseThrow(() -> new InvestigationException(InvestigationErrorCode.APPROVAL_NOT_FOUND));
        Instant now = Instant.now();
        if (!request.isOpen(now)) {
            throw new InvestigationException(InvestigationErrorCode.APPROVAL_CLOSED);
        }
        if (request.getRequestedBy().equals(manager.userId())) {
            throw new InvestigationException(InvestigationErrorCode.SELF_APPROVAL);
        }
        boolean approve = "APPROVE".equals(input.decision());
        String comment = input.comment() == null ? null : input.comment().trim();
        if (!approve && (comment == null || comment.isEmpty())) {
            throw new InvestigationException(InvestigationErrorCode.REJECT_REASON_REQUIRED);
        }
        request.decide(approve, manager.userId(), comment == null || comment.isEmpty() ? null : comment, now);
        auditTrail.staff(
                manager.userId(),
                approve ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED",
                TARGET,
                request.getId(),
                Map.of("requestType", request.getRequestType(), "requestedBy", request.getRequestedBy()));
        if (DECISION_OVERRIDE.equals(request.getRequestType())) {
            events.publishEvent(new OverrideDecided(request, approve));
        }
        if (approve) {
            apply(request, manager.userId());
        }
        return approvalQueryService.response(request, now);
    }

    // 요청 때 대상 확인 — 바꿀 것이 없는 요청은 받지 않는다. 기준값 요청은 있는 Rule인지만 본다
    private boolean targetRequestable(String requestType, Long targetId) {
        return switch (requestType) {
            case RULE_DISABLE -> ruleSwitch.state(targetId) == FdsRuleSwitch.RuleState.ON;
            case RULE_THRESHOLD -> ruleSwitch.state(targetId) != FdsRuleSwitch.RuleState.MISSING;
            case BLOCKLIST_RELEASE -> blocklistRegistry.state(targetId) == BlocklistRegistry.EntryState.ACTIVE;
            default -> false;
        };
    }

    // 승인 = 반영. 요청 뒤에 이미 바뀌었으면 승인은 그대로 두고 바꾸지 않은 이유를 감사 로그에 남긴다
    // 처리자는 승인한 관리자 (fds_rules.updated_by · blocklist_entries.released_by)
    private void apply(ApprovalRequest request, Long managerId) {
        String action;
        String targetType;
        TargetChange change;
        switch (request.getRequestType()) {
            case RULE_DISABLE -> {
                change = ruleSwitch.disable(request.getTargetId(), managerId);
                action = "RULE_DISABLED";
                targetType = "FDS_RULE";
            }
            case BLOCKLIST_RELEASE -> {
                change = blocklistRegistry.release(request.getTargetId(), managerId);
                action = "BLOCKLIST_RELEASED";
                targetType = "BLOCKLIST_ENTRY";
            }
            default -> {
                return;
            }
        }
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("approvalId", request.getId());
        detail.put("requestedBy", request.getRequestedBy());
        detail.put("changed", change == TargetChange.CHANGED);
        if (change != TargetChange.CHANGED) {
            detail.put("note", noteOf(request.getRequestType(), change));
        }
        auditTrail.staff(managerId, action, targetType, request.getTargetId(), detail);
    }

    private static String noteOf(String requestType, TargetChange change) {
        if (change == TargetChange.UNAVAILABLE) {
            return "대상이 없거나 바꿀 수 없어 그대로 둠";
        }
        return RULE_DISABLE.equals(requestType) ? "이미 꺼져 있음" : "이미 풀려 있음";
    }
}
