package com.donworry.investigation.service;

import com.donworry.identity.api.StaffDirectory;
import com.donworry.investigation.dto.InvestigationViewDtos.ApprovalResponse;
import com.donworry.investigation.entity.ApprovalRequest;
import com.donworry.investigation.repository.ApprovalRequestRepository;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 관리자 승인 요청 목록 (#82) — 기한이 지난 대기 요청은 "만료"로 보인다 (#102)
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ApprovalQueryService {

    private final ApprovalRequestRepository approvalRequestRepository;
    private final StaffDirectory staffDirectory;

    public List<ApprovalResponse> list(String status) {
        Instant now = Instant.now();
        return approvalRequestRepository.findAllByOrderByRequestedAtDesc().stream()
                .map(request -> response(request, now))
                .filter(response -> status == null || status.equals(response.status()))
                .toList();
    }

    public ApprovalResponse response(ApprovalRequest request, Instant now) {
        return new ApprovalResponse(
                request.getId(),
                request.getRequestType(),
                request.getTargetType(),
                request.getTargetId(),
                request.getTargetLabel() == null ? request.getTargetType() : request.getTargetLabel(),
                request.getPayload(),
                request.getReason(),
                request.getRequestedBy(),
                staffDirectory.displayName(request.getRequestedBy()).orElse("직원"),
                request.getRequestedAt(),
                request.displayStatus(now),
                request.getDecidedBy(),
                request.getDecidedAt(),
                request.getDecisionComment(),
                request.getExpiresAt(),
                List.of());
    }
}
