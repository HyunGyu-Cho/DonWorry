package com.donworry.investigation.service;

import com.donworry.identity.api.StaffDirectory;
import com.donworry.investigation.dto.InvestigationViewDtos.ApprovalResponse;
import com.donworry.investigation.entity.ApprovalRequest;
import com.donworry.investigation.repository.ApprovalRequestRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 2인 승인 요청 목록 (#82, 읽기만) — 요청 만들기 · 승인은 2-10
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ApprovalQueryService {

    private final ApprovalRequestRepository approvalRequestRepository;
    private final StaffDirectory staffDirectory;

    public List<ApprovalResponse> list(String status) {
        List<ApprovalRequest> rows = status == null
                ? approvalRequestRepository.findAllByOrderByRequestedAtDesc()
                : approvalRequestRepository.findByStatusOrderByRequestedAtDesc(status);
        return rows.stream().map(this::response).toList();
    }

    private ApprovalResponse response(ApprovalRequest request) {
        return new ApprovalResponse(
                request.getId(),
                request.getRequestType(),
                request.getTargetType(),
                request.getTargetId(),
                request.getTargetType(),
                request.getPayload(),
                request.getReason(),
                request.getRequestedBy(),
                staffDirectory.displayName(request.getRequestedBy()).orElse("직원"),
                request.getRequestedAt(),
                request.getStatus(),
                request.getDecidedBy(),
                request.getDecidedAt(),
                request.getDecisionComment(),
                request.getExpiresAt(),
                List.of());
    }
}
