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

// 구매자 본인 확인 응답 — 확인 요청 하나에 한 번만 (UNIQUE notification_id)
@Entity
@Table(name = "buyer_confirmations")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BuyerConfirmation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "confirmation_id")
    private Long confirmationId;

    @Column(name = "notification_id", nullable = false)
    private Long notificationId;

    @Column(name = "payment_id", nullable = false)
    private Long paymentId;

    // MINE / NOT_MINE
    @Column(name = "answer", nullable = false, length = 20)
    private String answer;

    @Column(name = "client_ip", length = 45)
    private String clientIp;

    @Column(name = "responded_at", nullable = false, columnDefinition = "DATETIME(6)")
    private Instant respondedAt;

    public static BuyerConfirmation of(
            Long notificationId, Long paymentId, String answer, String clientIp, Instant now) {
        BuyerConfirmation confirmation = new BuyerConfirmation();
        confirmation.notificationId = Objects.requireNonNull(notificationId, "notificationId");
        confirmation.paymentId = Objects.requireNonNull(paymentId, "paymentId");
        confirmation.answer = Objects.requireNonNull(answer, "answer");
        confirmation.clientIp = clientIp;
        confirmation.respondedAt = now.truncatedTo(ChronoUnit.MICROS);
        return confirmation;
    }
}
