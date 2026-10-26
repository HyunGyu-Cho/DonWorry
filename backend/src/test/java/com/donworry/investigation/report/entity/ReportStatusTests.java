package com.donworry.investigation.report.entity;

import static com.donworry.investigation.report.entity.ReportStatus.FAILED;
import static com.donworry.investigation.report.entity.ReportStatus.PENDING;
import static com.donworry.investigation.report.entity.ReportStatus.RUNNING;
import static com.donworry.investigation.report.entity.ReportStatus.SUCCEEDED;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

// ADR-0009 결정 2의 상태 방향을 DB 없이 확인한다
class ReportStatusTests {

    // 정상 흐름: 생성 대기 → 생성 중 → 완료 · 실패
    @Test
    void canBecome_normalFlow_allowed() {
        assertThat(PENDING.canBecome(RUNNING)).isTrue();
        assertThat(RUNNING.canBecome(SUCCEEDED)).isTrue();
        assertThat(RUNNING.canBecome(FAILED)).isTrue();
    }

    // 결과가 접수 응답보다 먼저 오면 생성 대기에서 바로 끝날 수 있다
    @Test
    void canBecome_fromPendingToFinished_allowed() {
        assertThat(PENDING.canBecome(SUCCEEDED)).isTrue();
        assertThat(PENDING.canBecome(FAILED)).isTrue();
    }

    // 끝난 보고서는 어떤 상태로도 바뀌지 않는다
    @Test
    void canBecome_fromFinished_neverAllowed() {
        for (ReportStatus finished : new ReportStatus[] {SUCCEEDED, FAILED}) {
            assertThat(finished.isFinished()).isTrue();
            for (ReportStatus next : ReportStatus.values()) {
                assertThat(finished.canBecome(next))
                        .as("%s → %s", finished, next)
                        .isFalse();
            }
        }
    }

    // 생성 중은 다시 생성 대기 · 생성 중으로 돌아가지 않는다
    @Test
    void canBecome_backwardOrSame_notAllowed() {
        assertThat(RUNNING.canBecome(PENDING)).isFalse();
        assertThat(RUNNING.canBecome(RUNNING)).isFalse();
        assertThat(PENDING.canBecome(PENDING)).isFalse();
    }

    // 아직 끝나지 않은 상태는 PENDING · RUNNING뿐이다
    @Test
    void isFinished_onlySucceededAndFailed() {
        assertThat(PENDING.isFinished()).isFalse();
        assertThat(RUNNING.isFinished()).isFalse();
    }
}
