package com.donworry.investigation.controller;

import com.donworry.investigation.dto.ApprovalDtos.ApprovalDecisionRequest;
import com.donworry.investigation.dto.ApprovalDtos.AuditLogResponse;
import com.donworry.investigation.dto.ApprovalDtos.NewApprovalRequest;
import com.donworry.investigation.dto.InvestigationViewDtos.ApprovalResponse;
import com.donworry.investigation.service.ApprovalCommandService;
import com.donworry.investigation.service.ApprovalQueryService;
import com.donworry.investigation.service.AuditQueryService;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// 관리자 승인 요청 · 감사 로그 (#82 목록, #102 만들기 · 처리 · 감사 로그)
@RestController
@RequestMapping("/api/investigation")
@RequiredArgsConstructor
public class ApprovalController {

    private final ApprovalQueryService approvalQueryService;
    private final ApprovalCommandService approvalCommandService;
    private final AuditQueryService auditQueryService;

    @GetMapping("/approvals")
    public List<ApprovalResponse> list(@RequestParam(required = false) String status) {
        return approvalQueryService.list(status);
    }

    // Rule 끄기 · 기준값 · 차단 해제 요청 (권고 반대 판정은 판정 API가 만든다)
    @PostMapping("/approvals")
    public ApprovalResponse create(@Valid @RequestBody NewApprovalRequest request) {
        return approvalCommandService.create(request);
    }

    @PostMapping("/approvals/{approvalId}/decision")
    public ApprovalResponse decide(@PathVariable Long approvalId, @Valid @RequestBody ApprovalDecisionRequest request) {
        return approvalCommandService.decide(approvalId, request);
    }

    @GetMapping("/audit-logs")
    public List<AuditLogResponse> auditLogs(
            @RequestParam(required = false) Long actorId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to) {
        return auditQueryService.list(actorId, action, from, to);
    }
}
