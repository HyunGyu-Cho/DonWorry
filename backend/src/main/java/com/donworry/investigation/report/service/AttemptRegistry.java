package com.donworry.investigation.report.service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

// 보고서별 "현재 시도 번호"와 지금까지 시도한 횟수 — 결과 수신은 현재 시도의 결과만 반영한다 (ADR-0009 결정 2)
// 접수 실패(#62)와 결과 실패(#64)를 같은 횟수로 센다 (첫 시도 포함 총 3번). 메모리에만 둔다
@Component
public class AttemptRegistry {

    private record State(UUID attemptId, int attempts) {}

    private final Map<Long, State> states = new ConcurrentHashMap<>();

    // 새 시도를 시작한다 — 번호는 새로, 횟수는 하나 늘린다
    public UUID next(Long reportId) {
        UUID attemptId = UUID.randomUUID();
        states.merge(reportId, new State(attemptId, 1), (old, fresh) -> new State(attemptId, old.attempts() + 1));
        return attemptId;
    }

    public int attempts(Long reportId) {
        State state = states.get(reportId);
        return state == null ? 0 : state.attempts();
    }

    public boolean isCurrent(Long reportId, UUID attemptId) {
        State state = states.get(reportId);
        return attemptId != null && state != null && attemptId.equals(state.attemptId());
    }

    public void forget(Long reportId) {
        states.remove(reportId);
    }
}
