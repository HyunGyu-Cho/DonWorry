package com.donworry.fds.repository;

import com.donworry.fds.api.FdsResult;
import com.donworry.fds.api.FdsRuleHitOutcome;
import com.donworry.fds.entity.FdsEvaluation;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FdsEvaluationRepository
        extends JpaRepository<FdsEvaluation, Long>, JpaSpecificationExecutor<FdsEvaluation> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<FdsEvaluation> findByCustomerRefAndPaymentRequestedAtBetween(
            String customerRef, Instant windowStart, Instant windowEnd);

    Optional<FdsEvaluation> findByEvaluationRequestId(UUID evaluationRequestId);

    long countByResult(FdsResult result);

    List<FdsEvaluation> findByPaymentIdOrderByEvaluatedAtDesc(Long paymentId);

    // Rule 적중 통계 (#82): from 이후 적중한 Rule 코드와 평가 시각
    @Query("select h.ruleCode, e.evaluatedAt from FdsRuleHit h join h.evaluation e"
            + " where h.outcome = :outcome and e.evaluatedAt >= :from")
    List<Object[]> findMatchedHitTimes(@Param("outcome") FdsRuleHitOutcome outcome, @Param("from") Instant from);

    @Query("select h.ruleCode, max(e.evaluatedAt) from FdsRuleHit h join h.evaluation e"
            + " where h.outcome = :outcome group by h.ruleCode")
    List<Object[]> findLastHitTimes(@Param("outcome") FdsRuleHitOutcome outcome);

    // 차단 항목별 막은 결제 (#100): [차단 항목 번호, from 이후 건수, 마지막 차단 시각(기간 무관)] — 근거 JSON의 blocklistEntryId로 센다
    @Query(
            value = "SELECT CAST(JSON_VALUE(h.evidence_refs, '$.blocklistEntryId') AS SIGNED) AS entry_id,"
                    + " SUM(CASE WHEN e.evaluated_at >= :from THEN 1 ELSE 0 END) AS recent, MAX(e.evaluated_at) AS last_at"
                    + " FROM fds_rule_hits h JOIN fds_evaluations e ON e.evaluation_id = h.evaluation_id"
                    + " WHERE h.rule_code = 'BLOCKLIST' AND h.outcome = 'MATCH' AND h.evidence_refs IS NOT NULL"
                    + " GROUP BY entry_id",
            nativeQuery = true)
    List<Object[]> findBlocklistHits(@Param("from") Instant from);
}
