package com.donworry.investigation.report.service;

// 보고서 내용을 채우는 쪽. 2-16 전까지는 FakeReportWriter(Spring 안의 템플릿), 그 뒤에는 ai-server
// 끝나면 ReportTransitions로 SUCCEEDED · FAILED를 저장한다 (2-12 조건부 UPDATE)
public interface ReportWriter {

    void write(ReportTarget target);
}
