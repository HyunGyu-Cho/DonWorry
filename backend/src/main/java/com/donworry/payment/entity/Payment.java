package com.donworry.payment.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "payments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "payment_id")
    private Long paymentId;

    @Column(name = "merchant_id", nullable = false)
    private Long merchantId;

    @Column(name = "customer_ref", nullable = false, length = 100)
    private String customerRef;

    @Column(name = "order_ref", nullable = false, length = 100)
    private String orderRef;

    @Column(name = "amount", nullable = false)
    private Long amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private PaymentStatus status;

    @Column(name = "authorization_ref", length = 100)
    private String authorizationRef;

    @Column(name = "created_at", nullable = false, columnDefinition = "DATETIME(6)")
    private Instant createdAt;

    // 상점 결제 준비 요청에서 받는 값 (cakeshop-contract 3절, #82)
    @Column(name = "order_title", length = 100)
    private String orderTitle;

    @Column(name = "pickup_at", columnDefinition = "DATETIME(6)")
    private Instant pickupAt;

    @Column(name = "buyer_name", length = 50)
    private String buyerName;

    @Column(name = "buyer_email", length = 254)
    private String buyerEmail;

    @Column(name = "customer_joined_at", columnDefinition = "DATETIME(6)")
    private Instant customerJoinedAt;

    // 결제창이 직접 수집하는 값 — 카드 번호 원문은 받지 않고 지문 · 끝 4자리 · 발급국만
    @Column(name = "client_ip", length = 45)
    private String clientIp;

    @Column(name = "device_id", length = 100)
    private String deviceId;

    @Column(name = "card_fingerprint", length = 64)
    private String cardFingerprint;

    @Column(name = "card_last4", columnDefinition = "CHAR(4)")
    private String cardLast4;

    @Column(name = "card_country", columnDefinition = "CHAR(2)")
    private String cardCountry;

    public static Payment pending(
            Long merchantId, String customerRef, String orderRef, Long amount, Instant createdAt) {
        return Payment.builder()
                .merchantId(merchantId)
                .customerRef(customerRef)
                .orderRef(orderRef)
                .amount(amount)
                .createdAt(createdAt)
                .build();
    }

    // 상점이 결제를 준비할 때 (결제창을 열기 전) — 카드는 결제창에서 고른다
    public static Payment ready(Order order, Instant createdAt) {
        Objects.requireNonNull(order, "order");
        Payment payment = pending(order.merchantId(), order.customerRef(), order.orderRef(), order.amount(), createdAt);
        payment.orderTitle = order.orderTitle();
        payment.pickupAt = order.pickupAt();
        payment.buyerName = order.buyerName();
        payment.buyerEmail = order.buyerEmail();
        payment.customerJoinedAt = order.customerJoinedAt();
        return payment;
    }

    // 결제 준비 요청 값 묶음
    public record Order(
            Long merchantId,
            String customerRef,
            String orderRef,
            String orderTitle,
            Long amount,
            String buyerName,
            String buyerEmail,
            Instant customerJoinedAt,
            Instant pickupAt) {}

    // 결제창에서 고른 카드 · 접속 정보 — FDS 평가 전에만 붙인다
    public void attachCheckout(String clientIp, String deviceId, String cardFingerprint, String last4, String country) {
        requireUnapprovedPending();
        this.clientIp = clientIp;
        this.deviceId = deviceId;
        this.cardFingerprint = Objects.requireNonNull(cardFingerprint, "cardFingerprint");
        this.cardLast4 = last4;
        this.cardCountry = country;
    }

    @Builder(access = AccessLevel.PRIVATE)
    private Payment(Long merchantId, String customerRef, String orderRef, Long amount, Instant createdAt) {
        this.merchantId = Objects.requireNonNull(merchantId, "merchantId");
        this.customerRef = requireReference(customerRef, "customerRef");
        this.orderRef = requireReference(orderRef, "orderRef");
        this.amount = Objects.requireNonNull(amount, "amount");
        // DATETIME(6) 왕복 시 생성 직후 값과 재조회 값의 정밀도를 맞춘다.
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt").truncatedTo(ChronoUnit.MICROS);
        this.status = PaymentStatus.PENDING;
    }

    public void requireUnapprovedPending() {
        if (status != PaymentStatus.PENDING || authorizationRef != null) {
            throw new IllegalStateException("승인 결과가 없는 PENDING 결제에만 적용할 수 있습니다");
        }
    }

    public void deny() {
        requireUnapprovedPending();
        status = PaymentStatus.DENIED;
    }

    public void recordAuthorizationSuccess(String reference, boolean hold) {
        requireUnapprovedPending();
        if (reference == null || reference.isBlank()) {
            throw new IllegalArgumentException("authorizationRef must not be blank");
        }
        authorizationRef = requireReference(reference, "authorizationRef");
        status = hold ? PaymentStatus.HELD : PaymentStatus.PENDING;
    }

    public void declineAuthorization() {
        requireUnapprovedPending();
        status = PaymentStatus.DECLINED;
    }

    public void completeCapture() {
        if (authorizationRef == null
                || authorizationRef.isBlank()
                || authorizationRef.codePointCount(0, authorizationRef.length()) > 100
                || (status != PaymentStatus.PENDING && status != PaymentStatus.CAPTURED)) {
            throw new IllegalStateException("승인된 PENDING 또는 CAPTURED 결제에만 매입 완료를 적용할 수 있습니다");
        }
        // 완료 표시가 유실되어 재전달돼도 기존 승인 참조와 상태를 보존한다.
        status = PaymentStatus.CAPTURED;
    }

    private static String requireReference(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.codePointCount(0, value.length()) > 100) {
            throw new IllegalArgumentException(name + " must not exceed 100 characters");
        }
        return value;
    }
}
