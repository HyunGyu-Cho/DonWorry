package com.donworry.payment.repository;

import com.donworry.payment.entity.Payment;
import jakarta.persistence.LockModeType;
import java.time.Instant;
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

    // FDS 입력 (#96): 같은 가맹점 · 같은 고객이 매입까지 끝낸 결제 수 — 과거 정상 결제가 있는지 (R02 · R03)
    @Query("select count(p) from Payment p where p.merchantId = :merchantId and p.customerRef = :customerRef"
            + " and p.status = com.donworry.payment.entity.PaymentStatus.CAPTURED")
    long countCaptured(@Param("merchantId") Long merchantId, @Param("customerRef") String customerRef);

    // AI 증거 (#90): 같은 가게 · 같은 고객이 이 시각보다 먼저 한 결제, 최근순 (개수는 limit으로)
    List<Payment> findByMerchantIdAndCustomerRefAndCreatedAtBeforeOrderByCreatedAtDesc(
            Long merchantId, String customerRef, Instant before, org.springframework.data.domain.Limit limit);

    // AI 증거 (#90): 이 시각보다 먼저 한 결제 전부의 [건수, 첫 결제 시각]
    @Query("select count(p), min(p.createdAt) from Payment p where p.merchantId = :merchantId"
            + " and p.customerRef = :customerRef and p.createdAt < :before")
    List<Object[]> statsBefore(
            @Param("merchantId") Long merchantId,
            @Param("customerRef") String customerRef,
            @Param("before") Instant before);

    // AI 증거 (#90): 이 시각보다 먼저 매입까지 끝난 결제의 카드 끝자리별 [끝자리, 건수, 금액 합, 최고 금액]
    @Query("select p.cardLast4, count(p), sum(p.amount), max(p.amount) from Payment p"
            + " where p.merchantId = :merchantId and p.customerRef = :customerRef and p.createdAt < :before"
            + " and p.status = com.donworry.payment.entity.PaymentStatus.CAPTURED group by p.cardLast4")
    List<Object[]> capturedByCardBefore(
            @Param("merchantId") Long merchantId,
            @Param("customerRef") String customerRef,
            @Param("before") Instant before);

    // AI 증거 (#90): 이 시각보다 먼저 이 고객이 이 카드로 매입까지 끝낸 결제 수
    @Query("select count(p) from Payment p where p.merchantId = :merchantId and p.customerRef = :customerRef"
            + " and p.cardFingerprint = :cardFingerprint and p.createdAt < :before"
            + " and p.status = com.donworry.payment.entity.PaymentStatus.CAPTURED")
    long countCapturedWithCardBefore(
            @Param("merchantId") Long merchantId,
            @Param("customerRef") String customerRef,
            @Param("cardFingerprint") String cardFingerprint,
            @Param("before") Instant before);

    // FDS 입력 (#82): 이 고객이 이 카드로 매입까지 끝낸 결제 수
    @Query("select count(p) from Payment p where p.merchantId = :merchantId and p.customerRef = :customerRef"
            + " and p.cardFingerprint = :cardFingerprint"
            + " and p.status = com.donworry.payment.entity.PaymentStatus.CAPTURED")
    long countCapturedWithCard(
            @Param("merchantId") Long merchantId,
            @Param("customerRef") String customerRef,
            @Param("cardFingerprint") String cardFingerprint);

    // FDS 입력 (#98): 이 고객이 이 기기로 매입까지 끝낸 결제 수 — R02 기존 미사용 단말기
    @Query("select count(p) from Payment p where p.merchantId = :merchantId and p.customerRef = :customerRef"
            + " and p.deviceId = :deviceId"
            + " and p.status = com.donworry.payment.entity.PaymentStatus.CAPTURED")
    long countCapturedWithDevice(
            @Param("merchantId") Long merchantId,
            @Param("customerRef") String customerRef,
            @Param("deviceId") String deviceId);

    // FDS 입력 (#98): 같은 가맹점 · 같은 고객이 이 기간에 한 결제 시도 수 — 카드를 붙인 결제만 (R04, 이번 포함)
    @Query("select count(p) from Payment p where p.merchantId = :merchantId and p.customerRef = :customerRef"
            + " and p.cardFingerprint is not null and p.createdAt > :from and p.createdAt <= :to")
    long countAttempts(
            @Param("merchantId") Long merchantId,
            @Param("customerRef") String customerRef,
            @Param("from") Instant from,
            @Param("to") Instant to);

    // FDS 입력 (#98): 같은 카드가 이 기간에 카드사에서 거절된 수 — 이번 결제 제외 (R08)
    @Query("select count(p) from Payment p where p.cardFingerprint = :cardFingerprint and p.paymentId <> :paymentId"
            + " and p.status = com.donworry.payment.entity.PaymentStatus.DECLINED"
            + " and p.createdAt > :from and p.createdAt <= :to")
    long countDeclinesWithCard(
            @Param("cardFingerprint") String cardFingerprint,
            @Param("paymentId") Long paymentId,
            @Param("from") Instant from,
            @Param("to") Instant to);

    // 사장님 보안 확인 결과 (#86) — 우리 가게 결제, 최근 먼저
    List<Payment> findByMerchantIdOrderByCreatedAtDesc(Long merchantId);
}
