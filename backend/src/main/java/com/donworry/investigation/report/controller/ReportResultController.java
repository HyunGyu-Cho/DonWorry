package com.donworry.investigation.report.controller;

import com.donworry.investigation.report.dto.InvestigationResultRequest;
import com.donworry.investigation.report.dto.StepReportRequest;
import com.donworry.investigation.report.service.ReportResultService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// ai-server → Spring 조사 결과 · 단계 알림 수신 (ADR-0009 결정 1, 2-19b). 직원 로그인과 별개로 서비스 키로만 지킨다
// 보안 설정(P1)이 전체를 잠글 때(#68 5단계)도 /internal/ai/**는 열어 두고 이 키로 막는다
@RestController
@RequestMapping("/internal/ai/reports")
@ConditionalOnProperty(prefix = "donworry.report", name = "writer", havingValue = "ai-server")
class ReportResultController {

    private final ReportResultService reportResultService;
    private final String serviceKey;

    ReportResultController(
            ReportResultService reportResultService, @Value("${donworry.ai-server.service-key}") String serviceKey) {
        this.reportResultService = reportResultService;
        this.serviceKey = serviceKey;
    }

    // 반영했든 무시했든(옛 시도 · 끝난 보고서) 받았으면 204 — ai-server가 같은 결과를 다시 보내지 않게
    @PostMapping("/{reportId}/result")
    ResponseEntity<Void> receive(
            @PathVariable Long reportId,
            @RequestHeader(name = "X-Service-Key", required = false) String key,
            @RequestBody InvestigationResultRequest result) {
        var rejected = ServiceKeyCheck.<Void>reject(serviceKey, key);
        if (rejected.isPresent()) {
            return rejected.get();
        }
        if (result.reportId() != null && !result.reportId().equals(reportId)) {
            return ResponseEntity.badRequest().build();
        }
        reportResultService.receive(reportId, result);
        return ResponseEntity.noContent().build();
    }

    // AI 판단 · 형식 검사 한 번이 끝날 때마다 (2-19b). 현재 시도가 아니면 409 RPT_003 — ai-server는 조사를 멈춘다
    @PostMapping("/{reportId}/steps")
    ResponseEntity<Void> step(
            @PathVariable Long reportId,
            @RequestHeader(name = "X-Service-Key", required = false) String key,
            @RequestBody StepReportRequest step) {
        var rejected = ServiceKeyCheck.<Void>reject(serviceKey, key);
        if (rejected.isPresent()) {
            return rejected.get();
        }
        reportResultService.recordStep(reportId, step);
        return ResponseEntity.noContent().build();
    }
}
