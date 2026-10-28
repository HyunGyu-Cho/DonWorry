package com.donworry.investigation.repository;

import com.donworry.investigation.entity.CaseType;
import com.donworry.investigation.entity.PaymentDecision;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

// 조사 기록의 물리 삭제를 노출하지 않고 필요한 저장·조회만 제공한다
public interface PaymentDecisionRepository extends Repository<PaymentDecision, Long> {

    PaymentDecision save(PaymentDecision decision);

    Optional<PaymentDecision> findById(Long decisionId);

    List<PaymentDecision> findByCasePaymentSecurityCaseId(Long caseId);

    long countByCasePaymentSecurityCaseId(Long caseId);

    // 비슷한 과거 사건 후보 (#104 2-9a) — 이 사건을 뺀 같은 유형 사건 중 since 이후 만든 사건의 판정, 최근 사건 먼저
    @Query("""
            SELECT d FROM PaymentDecision d
            JOIN FETCH d.casePayment cp
            JOIN FETCH cp.securityCase c
            WHERE c.caseType = :caseType AND c.id <> :excludeCaseId AND c.createdAt >= :since
            ORDER BY c.createdAt DESC, d.id
            """)
    List<PaymentDecision> findDecisionsOfOtherCasesSince(
            @Param("caseType") CaseType caseType,
            @Param("excludeCaseId") Long excludeCaseId,
            @Param("since") Instant since);
}
