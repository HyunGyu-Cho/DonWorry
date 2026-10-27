package com.donworry.payment.repository;

import com.donworry.payment.entity.Payment;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

// 금융 기록의 물리 삭제를 노출하지 않고 필요한 저장·조회만 제공한다.
public interface PaymentRepository extends Repository<Payment, Long> {

    Payment save(Payment payment);

    Optional<Payment> findById(Long paymentId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Payment p where p.paymentId = :paymentId")
    Optional<Payment> findByIdForUpdate(@Param("paymentId") Long paymentId);

    // FDS 입력 (#82): 이 고객이 매입까지 끝낸 결제의 평균 금액 — 이력이 없으면 null
    @Query("select avg(p.amount) from Payment p where p.merchantId = :merchantId and p.customerRef = :customerRef"
            + " and p.status = com.donworry.payment.entity.PaymentStatus.CAPTURED")
    Double averageCapturedAmount(@Param("merchantId") Long merchantId, @Param("customerRef") String customerRef);

    // FDS 입력 (#82): 이 고객이 이 카드로 매입까지 끝낸 결제 수
    @Query("select count(p) from Payment p where p.merchantId = :merchantId and p.customerRef = :customerRef"
            + " and p.cardFingerprint = :cardFingerprint"
            + " and p.status = com.donworry.payment.entity.PaymentStatus.CAPTURED")
    long countCapturedWithCard(
            @Param("merchantId") Long merchantId,
            @Param("customerRef") String customerRef,
            @Param("cardFingerprint") String cardFingerprint);

    // 사장님 보안 확인 결과 (#86) — 우리 가게 결제, 최근 먼저
    List<Payment> findByMerchantIdOrderByCreatedAtDesc(Long merchantId);
}
