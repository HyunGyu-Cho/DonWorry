package com.donworry.investigation.report.dto;

import java.util.List;
import java.util.Map;

// 증거 조회 응답 — ready=false면 원천 데이터 준비 전이라 data는 빈 목록, note에 이유
public record ToolResponse(String tool, boolean ready, String note, List<Map<String, Object>> data) {}
