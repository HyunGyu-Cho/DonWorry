package com.donworry.investigation.report.controller;

import com.donworry.investigation.report.dto.ToolCallRequest;
import com.donworry.investigation.report.dto.ToolResponse;
import com.donworry.investigation.report.service.ReportToolService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// ai-server → Spring 증거 조회 창구 (2-19, ADR-0009 Tool 표). 직원 로그인과 별개로 서비스 키로만 지킨다
@RestController
@RequestMapping("/internal/ai/tools")
@ConditionalOnProperty(prefix = "donworry.report", name = "writer", havingValue = "ai-server")
class ReportToolController {

    private final ReportToolService reportToolService;
    private final String serviceKey;

    ReportToolController(
            ReportToolService reportToolService, @Value("${donworry.ai-server.service-key}") String serviceKey) {
        this.reportToolService = reportToolService;
        this.serviceKey = serviceKey;
    }

    @PostMapping("/{toolName}")
    ResponseEntity<ToolResponse> call(
            @PathVariable String toolName,
            @RequestHeader(name = "X-Service-Key", required = false) String key,
            @RequestBody ToolCallRequest request) {
        return ServiceKeyCheck.<ToolResponse>reject(serviceKey, key)
                .orElseGet(() -> ResponseEntity.ok(reportToolService.call(toolName, request)));
    }
}
