package com.donworry.payment.service;

import com.donworry.identity.api.MerchantDirectory;
import com.donworry.payment.api.BuyerConfirmed;
import com.donworry.payment.dto.BuyerConfirmDtos.ConfirmRequestView;
import com.donworry.payment.dto.BuyerConfirmDtos.ConfirmationView;
import com.donworry.payment.entity.BuyerConfirmation;
import com.donworry.payment.entity.Notification;
import com.donworry.payment.entity.Payment;
import com.donworry.payment.repository.BuyerConfirmationRepository;
import com.donworry.payment.repository.NotificationRepository;
import com.donworry.payment.repository.PaymentRepository;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 구매자 본인 확인 (#82) — 매입 보류되면 확인 요청을 남기고, 구매자가 링크로 답하면 사건 쪽에 알린다
// 메일 발송(Mailpit)은 2-23. 지금은 시연 버튼이 링크를 새로 발급해 연다
@Service
@RequiredArgsConstructor
public class BuyerConfirmationService {

    static final Duration LINK_TTL = Duration.ofHours(24);
    private static final Set<String> ANSWERS = Set.of("MINE", "NOT_MINE");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final PaymentRepository paymentRepository;
    private final NotificationRepository notificationRepository;
    private final BuyerConfirmationRepository confirmationRepository;
    private final MerchantDirectory merchantDirectory;
    private final ApplicationEventPublisher events;

    // 매입 보류 커밋 뒤에 부른다 — 끝난 트랜잭션에 합류하지 않게 새 트랜잭션
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void requestFor(Long paymentId) {
        Payment payment = paymentRepository.findById(paymentId).orElse(null);
        if (payment == null || payment.getBuyerEmail() == null) {
            return;
        }
        if (notificationRepository
                .findFirstByPaymentIdAndKindOrderByCreatedAtDesc(paymentId, Notification.KIND_CHECK)
                .isPresent()) {
            return;
        }
        Instant now = Instant.now();
        String merchant = merchantName(payment);
        notificationRepository.save(Notification.buyerCheck(
                paymentId,
                payment.getBuyerEmail(),
                "[" + merchant + "] 결제 본인 확인 요청",
                CheckoutService.hash(newToken()),
                now.plus(LINK_TTL),
                now));
    }

    // 시연: 메일 대신 링크를 새로 발급해 돌려준다 (이전 링크는 무효)
    @Transactional
    public String issueDemoLink(Long paymentId) {
        Notification notification = notificationRepository
                .findFirstByPaymentIdAndKindOrderByCreatedAtDesc(paymentId, Notification.KIND_CHECK)
                .orElseThrow(() -> new PaymentException(PaymentErrorCode.CONFIRM_LINK_EXPIRED));
        String token = newToken();
        notification.reissueToken(CheckoutService.hash(token), Instant.now().plus(LINK_TTL));
        return "/confirm/" + token;
    }

    @Transactional(readOnly = true)
    public ConfirmRequestView view(String token) {
        Notification notification = validNotification(token);
        Payment payment = payment(notification.getPaymentId());
        String answered = confirmationRepository
                .findByNotificationId(notification.getNotificationId())
                .map(BuyerConfirmation::getAnswer)
                .orElse(null);
        return new ConfirmRequestView(
                merchantName(payment),
                payment.getOrderTitle(),
                payment.getAmount(),
                payment.getCreatedAt(),
                notification.getTokenExpiresAt(),
                answered);
    }

    // 한 번만 답할 수 있다. 저장 커밋 뒤 사건 쪽이 받는다 (BuyerConfirmed)
    @Transactional
    public ConfirmationView answer(String token, String answer, String clientIp) {
        if (answer == null || !ANSWERS.contains(answer)) {
            throw new PaymentException(PaymentErrorCode.INVALID_ANSWER);
        }
        Notification notification = validNotification(token);
        if (confirmationRepository
                .findByNotificationId(notification.getNotificationId())
                .isPresent()) {
            throw new PaymentException(PaymentErrorCode.CONFIRM_ALREADY_ANSWERED);
        }
        BuyerConfirmation saved = confirmationRepository.saveAndFlush(BuyerConfirmation.of(
                notification.getNotificationId(), notification.getPaymentId(), answer, clientIp, Instant.now()));
        events.publishEvent(new BuyerConfirmed(saved.getPaymentId(), saved.getAnswer(), saved.getRespondedAt()));
        return new ConfirmationView(
                String.valueOf(saved.getConfirmationId()),
                String.valueOf(saved.getPaymentId()),
                saved.getAnswer(),
                saved.getRespondedAt());
    }

    private Notification validNotification(String token) {
        Optional<Notification> found = notificationRepository.findByConfirmTokenHash(CheckoutService.hash(token));
        if (found.isEmpty() || found.get().isExpired(Instant.now())) {
            throw new PaymentException(PaymentErrorCode.CONFIRM_LINK_EXPIRED);
        }
        return found.get();
    }

    private Payment payment(Long paymentId) {
        return paymentRepository
                .findById(paymentId)
                .orElseThrow(() -> new PaymentException(PaymentErrorCode.PAYMENT_NOT_FOUND));
    }

    private String merchantName(Payment payment) {
        return merchantDirectory
                .find(payment.getMerchantId())
                .map(MerchantDirectory.MerchantView::displayName)
                .orElse("상점");
    }

    private static String newToken() {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
