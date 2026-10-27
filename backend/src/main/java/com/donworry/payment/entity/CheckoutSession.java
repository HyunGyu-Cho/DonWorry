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

// 돈워리 결제창 1회용 세션 (#82) — 토큰 원문은 저장하지 않고 해시만
@Entity
@Table(name = "checkout_sessions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CheckoutSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "session_id")
    private Long sessionId;

    @Column(name = "payment_id", nullable = false)
    private Long paymentId;

    @Column(name = "token_hash", nullable = false, columnDefinition = "CHAR(64)")
    private String tokenHash;

    @Column(name = "return_url", nullable = false, length = 500)
    private String returnUrl;

    @Column(name = "expires_at", nullable = false, columnDefinition = "DATETIME(6)")
    private Instant expiresAt;

    @Column(name = "used_at", columnDefinition = "DATETIME(6)")
    private Instant usedAt;

    @Column(name = "client_ip", length = 45)
    private String clientIp;

    @Column(name = "device_id", length = 100)
    private String deviceId;

    @Column(name = "created_at", nullable = false, columnDefinition = "DATETIME(6)")
    private Instant createdAt;

    public static CheckoutSession issue(
            Long paymentId, String tokenHash, String returnUrl, Instant expiresAt, Instant now) {
        CheckoutSession session = new CheckoutSession();
        session.paymentId = Objects.requireNonNull(paymentId, "paymentId");
        session.tokenHash = Objects.requireNonNull(tokenHash, "tokenHash");
        session.returnUrl = Objects.requireNonNull(returnUrl, "returnUrl");
        session.expiresAt = micros(expiresAt);
        session.createdAt = micros(now);
        return session;
    }

    public boolean isUsed() {
        return usedAt != null;
    }

    public boolean isExpired(Instant now) {
        return !isUsed() && !now.isBefore(expiresAt);
    }

    // 결제를 실행할 때 한 번만 — 두 번째 결제는 부르는 쪽이 막는다
    public void use(Instant now, String clientIp, String deviceId) {
        if (isUsed()) {
            throw new IllegalStateException("이미 결제한 결제창입니다");
        }
        this.usedAt = micros(now);
        this.clientIp = clientIp;
        this.deviceId = deviceId;
    }

    private static Instant micros(Instant at) {
        return Objects.requireNonNull(at).truncatedTo(ChronoUnit.MICROS);
    }
}
