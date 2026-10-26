package com.donworry.investigation.report.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.donworry.MariaDbTestContainerConfig;
import com.donworry.investigation.report.entity.AiReport;
import com.donworry.investigation.report.entity.ReportStatus;
import jakarta.persistence.EntityManager;
import java.lang.reflect.Method;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

// 실제 MariaDB에서 ai_reports 저장 · 버전 제약 · 최대 버전 조회 · 조건부 상태 변경을 확인한다
// 각 테스트는 트랜잭션 안에서 돌고 끝나면 롤백된다
// DB는 다른 테스트(커밋하는 흐름 테스트)와 함께 쓰므로 Case ID를 테스트마다 새로 뽑는다
@Tag("mariadb")
@SpringBootTest
@Import(MariaDbTestContainerConfig.class)
@Transactional
class AiReportRepositoryTests {

    // DATETIME(6)은 마이크로초까지만 저장하므로 비교값도 맞춰 둔다
    static final Instant NOW = Instant.now().truncatedTo(ChronoUnit.MICROS);

    @Autowired
    AiReportRepository aiReportRepository;

    @Autowired
    EntityManager entityManager;

    // 흐름 테스트가 만드는 실제 Case ID(1부터)와 겹치지 않는 큰 값에서 시작한다
    static final AtomicLong NEXT_CASE_ID = new AtomicLong(9_000_000L);

    long caseId;
    long otherCaseId;
    long emptyCaseId;

    @BeforeEach
    void newCaseIds() {
        caseId = NEXT_CASE_ID.incrementAndGet();
        otherCaseId = NEXT_CASE_ID.incrementAndGet();
        emptyCaseId = NEXT_CASE_ID.incrementAndGet();
    }

    // 같은 Case에 같은 보고서 버전을 두 번 저장하면 DB가 막는다
    @Test
    void aiReport_sameCaseAndVersionTwice_violatesUniqueConstraint() {
        aiReportRepository.save(AiReport.pending(caseId, 1, 1, NOW));
        entityManager.flush();

        assertThatThrownBy(() -> {
                    aiReportRepository.save(AiReport.pending(caseId, 1, 2, NOW));
                    entityManager.flush();
                })
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    // 최대 보고서 버전은 해당 Case 것만 보고, 보고서가 없으면 빈 값이다
    @Test
    void findMaxReportVersion_returnsLatestOfThatCaseOnly() {
        aiReportRepository.save(AiReport.pending(caseId, 1, 1, NOW));
        aiReportRepository.save(AiReport.pending(caseId, 2, 2, NOW));
        aiReportRepository.save(AiReport.pending(otherCaseId, 5, 3, NOW));
        entityManager.flush();

        assertThat(aiReportRepository.findMaxReportVersion(caseId)).contains(2);
        assertThat(aiReportRepository.findMaxReportVersion(emptyCaseId)).isEmpty();
    }

    // 새 보고서를 저장하고 다시 읽으면 PENDING · 본문 없음 · 생성 시각 그대로다
    @Test
    void aiReport_pendingSavedAndReloaded_keepsValues() {
        Instant createdWithNanos = NOW.plusNanos(123);
        AiReport saved = aiReportRepository.save(AiReport.pending(caseId, 1, 3, createdWithNanos));
        entityManager.flush();
        entityManager.clear();

        AiReport reloaded = aiReportRepository.findById(saved.getId()).orElseThrow();

        assertThat(reloaded.getCaseId()).isEqualTo(caseId);
        assertThat(reloaded.getReportVersion()).isEqualTo(1);
        assertThat(reloaded.getEvidenceVersion()).isEqualTo(3);
        assertThat(reloaded.getStatus()).isEqualTo(ReportStatus.PENDING);
        assertThat(reloaded.getReportBody()).isNull();
        assertThat(reloaded.getCompletedAt()).isNull();
        assertThat(reloaded.getCreatedAt()).isEqualTo(saved.getCreatedAt());
    }

    // 보고서는 버전별로 쌓으므로 저장소가 물리 삭제 메서드를 노출하지 않는다 (AGENTS.md 6절)
    @Test
    void aiReportRepository_doesNotExposeDelete() {
        assertThat(Arrays.asList(AiReportRepository.class.getMethods()))
                .extracting(Method::getName)
                .noneMatch(name -> name.startsWith("delete"));
    }

    static final Map<String, Object> BODY = Map.of("summary", "카드 도용 가능성이 있어 본인 확인이 필요합니다");
    static final Map<String, Object> ERROR = Map.of("error", Map.of("code", "LLM_TIMEOUT", "attempts", 3));

    // 저장 뒤 DB에서 다시 읽는다 (조건부 UPDATE는 영속성 컨텍스트를 거치지 않으므로)
    private AiReport reload(Long reportId) {
        entityManager.flush();
        entityManager.clear();
        return aiReportRepository.findById(reportId).orElseThrow();
    }

    private Long pending(Long caseId, int reportVersion) {
        Long id = aiReportRepository
                .save(AiReport.pending(caseId, reportVersion, 1, NOW))
                .getId();
        entityManager.flush();
        return id;
    }

    // 원하는 상태의 보고서를 만든다 (정상 경로로만 옮긴다)
    private Long reportIn(ReportStatus status, Long caseId, int reportVersion) {
        Long id = pending(caseId, reportVersion);
        switch (status) {
            case PENDING -> {}
            case RUNNING -> aiReportRepository.markRunning(id);
            case SUCCEEDED -> aiReportRepository.markSucceeded(id, BODY, NOW);
            case FAILED -> aiReportRepository.markFailed(id, ERROR, NOW);
        }
        assertThat(reload(id).getStatus()).isEqualTo(status);
        return id;
    }

    private int move(Long reportId, ReportStatus next) {
        return switch (next) {
            case PENDING -> 0;
            case RUNNING -> aiReportRepository.markRunning(reportId);
            case SUCCEEDED -> aiReportRepository.markSucceeded(reportId, BODY, NOW.plusSeconds(1));
            case FAILED -> aiReportRepository.markFailed(reportId, ERROR, NOW.plusSeconds(1));
        };
    }

    // 정상 흐름: 생성 대기 → 생성 중 → 완료, 완료 때 본문 · 완료 시각이 함께 저장된다
    @Test
    void markStatus_normalFlow_savesBodyAndCompletedAt() {
        Long id = pending(caseId, 1);

        assertThat(aiReportRepository.markRunning(id)).isEqualTo(1);
        assertThat(reload(id).getStatus()).isEqualTo(ReportStatus.RUNNING);
        assertThat(aiReportRepository.markSucceeded(id, BODY, NOW)).isEqualTo(1);

        AiReport done = reload(id);
        assertThat(done.getStatus()).isEqualTo(ReportStatus.SUCCEEDED);
        assertThat(done.getReportBody()).isEqualTo(BODY);
        assertThat(done.getCompletedAt()).isEqualTo(NOW);
    }

    // 결과가 접수 응답보다 먼저 와서 완료되면, 뒤이은 생성 중 변경은 0건이고 완료가 유지된다
    @Test
    void markRunning_afterSucceeded_changesNothing() {
        Long id = pending(caseId, 1);
        aiReportRepository.markSucceeded(id, BODY, NOW);

        assertThat(aiReportRepository.markRunning(id)).isZero();
        assertThat(reload(id).getStatus()).isEqualTo(ReportStatus.SUCCEEDED);
    }

    // 실패로 끝난 뒤 늦게 온 성공 결과는 뒤집지 않는다 — 본문 · 완료 시각도 그대로
    @Test
    void markSucceeded_afterFailed_keepsFailure() {
        Long id = reportIn(ReportStatus.FAILED, caseId, 1);

        assertThat(aiReportRepository.markSucceeded(id, BODY, NOW.plusSeconds(30)))
                .isZero();

        AiReport kept = reload(id);
        assertThat(kept.getStatus()).isEqualTo(ReportStatus.FAILED);
        assertThat(kept.getReportBody()).isEqualTo(ERROR);
        assertThat(kept.getCompletedAt()).isEqualTo(NOW);
    }

    // 한 보고서를 바꿔도 같은 Case의 다른 버전 보고서는 영향이 없다
    @Test
    void markStatus_otherVersion_untouched() {
        Long v1 = reportIn(ReportStatus.SUCCEEDED, caseId, 1);
        Long v2 = pending(caseId, 2);

        aiReportRepository.markFailed(v2, ERROR, NOW);

        assertThat(reload(v1).getStatus()).isEqualTo(ReportStatus.SUCCEEDED);
        assertThat(reload(v1).getReportBody()).isEqualTo(BODY);
        assertThat(reload(v2).getStatus()).isEqualTo(ReportStatus.FAILED);
    }

    // 없는 보고서를 바꾸려 하면 오류 없이 0건이다
    @Test
    void markStatus_unknownReport_changesNothing() {
        assertThat(aiReportRepository.markRunning(999_999L)).isZero();
        assertThat(aiReportRepository.markSucceeded(999_999L, BODY, NOW)).isZero();
        assertThat(aiReportRepository.markFailed(999_999L, ERROR, NOW)).isZero();
    }

    // 모든 (이전 상태 → 다음 상태) 조합에서 DB 조건부 UPDATE 결과가 ReportStatus 규칙과 같다
    @Test
    void markStatus_everyTransition_matchesReportStatusRule() {
        int version = 1;
        for (ReportStatus from : ReportStatus.values()) {
            for (ReportStatus next : ReportStatus.values()) {
                if (next == ReportStatus.PENDING) {
                    // 생성 대기로 되돌리는 경로는 저장소에 없다 (새 보고서는 pending()으로만 만든다)
                    assertThat(from.canBecome(next)).isFalse();
                    continue;
                }
                Long id = reportIn(from, caseId, version++);
                int changed = move(id, next);
                ReportStatus after = reload(id).getStatus();

                assertThat(changed == 1).as("%s → %s 변경 건수", from, next).isEqualTo(from.canBecome(next));
                assertThat(after).as("%s → %s 뒤 상태", from, next).isEqualTo(from.canBecome(next) ? next : from);
            }
        }
    }
}
