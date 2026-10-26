package com.donworry.investigation.report.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

// 시도 기록 — 늦은 시도 찾기 (2-18)
class AttemptRegistryTests {

    // 기준 시각보다 먼저 시작한 현재 시도만 늦은 시도로 나온다. 끝나서 잊은 시도는 나오지 않는다
    @Test
    void startedBefore_onlyCurrentAttemptsOlderThanCutoff() {
        AttemptRegistry registry = new AttemptRegistry();
        UUID first = registry.next(1L);
        registry.next(2L);
        registry.forget(2L);

        assertThat(registry.startedBefore(Instant.now().plusSeconds(1))).containsOnlyKeys(1L);
        assertThat(registry.startedBefore(Instant.now().plusSeconds(1)).get(1L)).isEqualTo(first);
        assertThat(registry.startedBefore(Instant.now().minusSeconds(60))).isEmpty();
    }
}
