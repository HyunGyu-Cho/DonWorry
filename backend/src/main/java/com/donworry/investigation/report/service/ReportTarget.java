package com.donworry.investigation.report.service;

// 작성기에 넘기는 보고서 한 건 — PENDING으로 잡힌 행. caseType은 ai-server가 보고서 형식을 고르는 데 쓴다
public record ReportTarget(Long reportId, Long caseId, String caseType, int reportVersion, int evidenceVersion) {}
