package com.donworry.investigation.report.controller;

import com.donworry.investigation.report.dto.ReportRunResponse;
import com.donworry.investigation.report.service.ReportQueryService;
import com.donworry.investigation.report.service.ReportRetryService;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// 화면용 보고서 조회 (2-17b) — 사건 화면 "AI 조사 요약" · 보고서 화면이 부른다
// 직원 계정 사건 열람 제한(RPT_010)은 직원 사건이 생기는 2-9에서
@RestController
@RequestMapping("/api/investigation/cases/{caseId}/report")
@RequiredArgsConstructor
public class ReportViewController {

    private final ReportQueryService reportQueryService;
    private final ReportRetryService reportRetryService;

    @GetMapping
    public Map<String, Object> report(@PathVariable Long caseId) {
        return reportQueryService.latestCompleted(caseId);
    }

    @GetMapping("/run")
    public ReportRunResponse run(@PathVariable Long caseId) {
        return reportQueryService.latestRun(caseId);
    }

    // 직원 [AI 조사 다시 하기] (2-19e) — 최신 보고서가 실패일 때만. 바뀐 조사 상태를 돌려준다
    @PostMapping("/retry")
    public ReportRunResponse retry(@PathVariable Long caseId) {
        reportRetryService.retry(caseId);
        return reportQueryService.latestRun(caseId);
    }
}
