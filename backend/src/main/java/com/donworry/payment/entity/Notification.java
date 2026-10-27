package com.donworry.payment.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 메일 발송 기록 (notifications) — #82는 구매자 본인 확인 요청(CHECK)만 남긴다. 실제 발송(Mailpit)은 2-23
@Entity
@Table(name = "notifications")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Notification {

    public static final String KIND_CHECK = "CHECK";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "notification_id")
    private Long notificationId;

    @Column(name = "payment_id")
    private Long paymentId;

    // BUYER / OWNER
    @Column(name = "recipient_type", nullable = false, length = 20)
    private String recipientType;

    @Column(name = "recipient_email", nullable = false, length = 254)
    private String recipientEmail;

    // FDS / RESULT / FUNDS / PAYMENT / CHECK
    @Column(name = "kind", nullable = false, length = 20)
    private String kind;

    @Column(name = "subject", nullable = false, length = 200)
    private String subject;

    // PENDING(발송 대기) / SENT / FAILED
    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "confirm_token_hash", length = 64)
    private String confirmTokenHash;

    @Column(name = "token_expires_at", columnDefinition = "DATETIME(6)")
    private Instant tokenExpiresAt;

    @Column(name = "created_at", nullable = false, columnDefinition = "DATETIME(6)")
    private Instant createdAt;

    @Column(name = "sent_at", columnDefinition = "DATETIME(6)")
    private Instant sentAt;

    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    // 구매자 본인 확인 요청 — 메일 발송 전이라 PENDING. 링크 토큰은 해시만 저장한다
    public static Notification buyerCheck(
            Long paymentId, String email, String subject, String tokenHash, Instant expiresAt, Instant now) {
        Notification notification = new Notification();
        notification.paymentId = Objects.requireNonNull(paymentId, "paymentId");
        notification.recipientType = "BUYER";
        notification.recipientEmail = Objects.requireNonNull(email, "email");
        notification.kind = KIND_CHECK;
        notification.subject = subject;
        notification.status = "PENDING";
        notification.confirmTokenHash = tokenHash;
        notification.tokenExpiresAt = micros(expiresAt);
        notification.createdAt = micros(now);
        return notification;
    }

    // 결제 안내 메일 (#86: 승인 취소 안내) — 발송 전이라 PENDING, 링크 없음
    public static Notification buyerPayment(Long paymentId, String email, String subject, Instant now) {
        Notification notification = new Notification();
        notification.paymentId = Objects.requireNonNull(paymentId, "paymentId");
        notification.recipientType = "BUYER";
        notification.recipientEmail = Objects.requireNonNull(email, "email");
        notification.kind = "PAYMENT";
        notification.subject = subject;
        notification.status = "PENDING";
        notification.createdAt = micros(now);
        return notification;
    }

    // 링크를 새로 발급한다 — 이전 링크는 더 쓸 수 없다 (시연: 메일 대신 화면 버튼으로 연다)
    public void reissueToken(String tokenHash, Instant expiresAt) {
        this.confirmTokenHash = Objects.requireNonNull(tokenHash, "tokenHash");
        this.tokenExpiresAt = micros(expiresAt);
    }

    public boolean isExpired(Instant now) {
        return tokenExpiresAt == null || !now.isBefore(tokenExpiresAt);
    }

    private static Instant micros(Instant at) {
        return Objects.requireNonNull(at).truncatedTo(ChronoUnit.MICROS);
    }
}
