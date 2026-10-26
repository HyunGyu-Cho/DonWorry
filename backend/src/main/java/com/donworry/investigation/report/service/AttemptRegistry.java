package com.donworry.investigation.report.service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

// 보고서별 "현재 시도 번호" — 결과 수신(2-17)은 현재 시도의 결과만 반영한다 (ADR-0009 결정 2)
// 메모리에만 둔다. 서버가 재시작되면 사라지고, 재시작 전 시도의 늦은 결과는 같은 규칙으로 무시된다
@Component
public class AttemptRegistry {

    private final Map<Long, UUID> current = new ConcurrentHashMap<>();

    public UUID next(Long reportId) {
        UUID attemptId = UUID.randomUUID();
        current.put(reportId, attemptId);
        return attemptId;
    }

    public boolean isCurrent(Long reportId, UUID attemptId) {
        return attemptId != null && attemptId.equals(current.get(reportId));
    }

    public void forget(Long reportId) {
        current.remove(reportId);
    }
}
