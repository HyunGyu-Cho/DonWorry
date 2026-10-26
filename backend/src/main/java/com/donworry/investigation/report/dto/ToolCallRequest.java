package com.donworry.investigation.report.dto;

import java.util.Map;
import java.util.UUID;

// ai-server → Spring 증거 조회 요청 (2-19). 조사 중인 보고서의 현재 시도만 물을 수 있다
// args = 창구별 입력 (예: get_fds_evidence의 paymentIds — 없으면 사건 결제 전부)
public record ToolCallRequest(Long reportId, UUID attemptId, Map<String, Object> args) {}
