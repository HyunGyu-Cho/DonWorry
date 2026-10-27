package com.donworry.investigation.controller;

import com.donworry.investigation.dto.InvestigationViewDtos.ApprovalResponse;
import com.donworry.investigation.service.ApprovalQueryService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// 2인 승인 요청 (#82: 목록만) — 사건 화면이 권고 반대 판정 요청을 확인할 때 부른다
@RestController
@RequestMapping("/api/investigation/approvals")
@RequiredArgsConstructor
public class ApprovalController {

    private final ApprovalQueryService approvalQueryService;

    @GetMapping
    public List<ApprovalResponse> list(@RequestParam(required = false) String status) {
        return approvalQueryService.list(status);
    }
}
