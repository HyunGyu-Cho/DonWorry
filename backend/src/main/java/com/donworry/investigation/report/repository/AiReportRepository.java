package com.donworry.investigation.report.repository;

import com.donworry.investigation.report.entity.AiReport;
import com.donworry.investigation.report.entity.ReportStatus;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

// 보고서는 버전별로 쌓으므로 물리 삭제를 노출하지 않고 필요한 저장 · 조회만 제공한다
// 상태 변경은 모두 조건부 UPDATE다 (ADR-0009 결정 2). 반환값 = 바뀐 행 수, 0이면 이미 처리된 것으로 본다
// 조건의 이전 상태는 ReportStatus.allowedFrom()과 같아야 한다 — AiReportRepositoryTests가 모든 조합을 대조한다
public interface AiReportRepository extends Repository<AiReport, Long> {

    AiReport save(AiReport report);

    Optional<AiReport> findById(Long reportId);

    List<AiReport> findByCaseIdOrderByReportVersionAsc(Long caseId);

    // 같은 Case에 아직 끝나지 않은 보고서가 있는지 (ADR-0009 결정 3 — 있으면 새로 만들지 않음)
    boolean existsByCaseIdAndStatusIn(Long caseId, Collection<ReportStatus> statuses);

    // 요청한 증거 버전 이상을 이미 조사했는지 — 상태 무관, FAILED여도 다시 만들지 않는다 (3회 제한 유지)
    boolean existsByCaseIdAndEvidenceVersionGreaterThanEqual(Long caseId, int evidenceVersion);

    // 다음 report_version 계산용 — 해당 Case에 보고서가 없으면 빈 값
    @Query("SELECT MAX(r.reportVersion) FROM AiReport r WHERE r.caseId = :caseId")
    Optional<Integer> findMaxReportVersion(@Param("caseId") Long caseId);

    // FastAPI가 202로 접수했을 때. PENDING일 때만 — 결과가 먼저 와서 끝났으면 0건
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            UPDATE AiReport r
               SET r.status = com.donworry.investigation.report.entity.ReportStatus.RUNNING
             WHERE r.id = :reportId
               AND r.status = com.donworry.investigation.report.entity.ReportStatus.PENDING
            """)
    int markRunning(@Param("reportId") Long reportId);

    // 결과가 구조 검증을 통과했을 때. PENDING · RUNNING일 때만 — 끝난 보고서(FAILED 포함)는 뒤집지 않는다
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            UPDATE AiReport r
               SET r.status = com.donworry.investigation.report.entity.ReportStatus.SUCCEEDED,
                   r.reportBody = :reportBody,
                   r.completedAt = :completedAt
             WHERE r.id = :reportId
               AND r.status IN (com.donworry.investigation.report.entity.ReportStatus.PENDING,
                                com.donworry.investigation.report.entity.ReportStatus.RUNNING)
            """)
    int markSucceeded(
            @Param("reportId") Long reportId,
            @Param("reportBody") Map<String, Object> reportBody,
            @Param("completedAt") Instant completedAt);

    // 총 3회 시도가 모두 실패했을 때. 본문에는 error 객체만 둔다 (화면에는 보내지 않음, ADR-0009)
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            UPDATE AiReport r
               SET r.status = com.donworry.investigation.report.entity.ReportStatus.FAILED,
                   r.reportBody = :errorBody,
                   r.completedAt = :completedAt
             WHERE r.id = :reportId
               AND r.status IN (com.donworry.investigation.report.entity.ReportStatus.PENDING,
                                com.donworry.investigation.report.entity.ReportStatus.RUNNING)
            """)
    int markFailed(
            @Param("reportId") Long reportId,
            @Param("errorBody") Map<String, Object> errorBody,
            @Param("completedAt") Instant completedAt);
}
