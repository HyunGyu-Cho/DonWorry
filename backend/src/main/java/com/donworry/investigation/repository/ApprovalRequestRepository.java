package com.donworry.investigation.repository;

import com.donworry.investigation.entity.ApprovalRequest;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface ApprovalRequestRepository extends Repository<ApprovalRequest, Long> {

    ApprovalRequest save(ApprovalRequest request);

    Optional<ApprovalRequest> findById(Long id);

    // 두 관리자가 동시에 눌러도 한 번만 처리되게 행을 잠근다
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM ApprovalRequest a WHERE a.id = :id")
    Optional<ApprovalRequest> findByIdForUpdate(@Param("id") Long id);

    List<ApprovalRequest> findAllByOrderByRequestedAtDesc();

    // 같은 대상에 아직 처리 기한이 남은 대기 요청이 있는지
    boolean existsByRequestTypeAndTargetTypeAndTargetIdAndStatusAndExpiresAtAfter(
            String requestType, String targetType, Long targetId, String status, Instant now);

    // 권고 반대 판정 대기 — 대상은 사건의 결제(case_payments) 번호
    boolean existsByRequestTypeAndStatusAndExpiresAtAfterAndTargetIdIn(
            String requestType, String status, Instant now, Collection<Long> targetIds);
}
