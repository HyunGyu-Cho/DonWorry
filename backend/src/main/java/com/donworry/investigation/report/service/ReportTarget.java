package com.donworry.investigation.report.service;

// 작성기에 넘기는 보고서 한 건 — PENDING으로 잡힌 행
public record ReportTarget(Long reportId, Long caseId, int reportVersion, int evidenceVersion) {}
