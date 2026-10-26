package com.donworry.investigation.report.dto;

import java.util.List;
import java.util.Map;
import java.util.UUID;

// ai-server → Spring 조사 결과 (ai-server app/schemas/investigation.py InvestigationResult와 같은 모양)
// report는 AI가 쓴 칸만 있다 — Spring이 검사한 뒤 화면용 결론 카드로 합친다 (ADR-0009 결정 4)
public record InvestigationResultRequest(
        Long reportId,
        UUID attemptId,
        Long caseId,
        String caseType,
        Integer evidenceVersion,
        String status,
        Map<String, Object> report,
        Map<String, Object> error,
        List<Map<String, Object>> steps) {

    public boolean isSucceeded() {
        return "SUCCEEDED".equals(status);
    }

    // ai-server 조사가 끝났는지 — 조회(2-18)에서 아직 조사 중이면 false
    public boolean isFinished() {
        return "SUCCEEDED".equals(status) || "FAILED".equals(status);
    }
}
