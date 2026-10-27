package com.donworry.payment.service;

import com.donworry.identity.api.MerchantDirectory;
import com.donworry.payment.dto.CheckoutDtos.CheckoutResultResponse;
import com.donworry.payment.dto.CheckoutDtos.CheckoutSessionResponse;
import com.donworry.payment.entity.CheckoutSession;
import com.donworry.payment.entity.Payment;
import com.donworry.payment.entity.PaymentStatus;
import com.donworry.payment.repository.CheckoutSessionRepository;
import com.donworry.payment.repository.PaymentRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 돈워리 결제창 (cakeshop-contract 4절, #82) — 준비된 결제에 1회용 결제창을 열고, 카드를 고르면 FDS 평가 · 승인
@Service
@RequiredArgsConstructor
public class CheckoutService {

    static final Duration SESSION_TTL = Duration.ofMinutes(15);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final PaymentRepository paymentRepository;
    private final CheckoutSessionRepository sessionRepository;
    private final PaymentEvaluationFlowService flowService;
    private final MerchantDirectory merchantDirectory;
    private final CheckoutSessionUse checkoutSessionUse;

    // 결제 준비 + 결제창 발급. 토큰 원문은 여기서 한 번만 돌려준다
    @Transactional
    public String open(Payment.Order order, String returnUrl) {
        Instant now = Instant.now();
        Payment payment = paymentRepository.save(Payment.ready(order, now));
        String token = newToken();
        sessionRepository.save(
                CheckoutSession.issue(payment.getPaymentId(), hash(token), returnUrl, now.plus(SESSION_TTL), now));
        return token;
    }

    @Transactional(readOnly = true)
    public CheckoutSessionResponse view(String token) {
        CheckoutSession session = sessionRepository
                .findByTokenHash(hash(token))
                .orElseThrow(() -> new PaymentException(PaymentErrorCode.CHECKOUT_EXPIRED));
        Payment payment = payment(session.getPaymentId());
        Instant now = Instant.now();
        if (session.isExpired(now)) {
            throw new PaymentException(PaymentErrorCode.CHECKOUT_EXPIRED);
        }
        String merchantName = merchantDirectory
                .find(payment.getMerchantId())
                .map(MerchantDirectory.MerchantView::displayName)
                .orElse("");
        return new CheckoutSessionResponse(
                merchantName,
                payment.getOrderTitle(),
                payment.getAmount(),
                payment.getBuyerName(),
                maskEmail(payment.getBuyerEmail()),
                session.getExpiresAt(),
                session.isUsed() ? "PAID" : "OPEN");
    }

    // 결제창을 쓰고 카드를 붙인 뒤(커밋) FDS 평가 · 승인을 한다 — 같은 결제창으로 두 번 결제할 수 없다
    public CheckoutResultResponse pay(String token, String cardToken, String clientIp, String deviceId) {
        DemoCard card = DemoCard.of(cardToken).orElseThrow(() -> new PaymentException(PaymentErrorCode.UNKNOWN_CARD));
        CheckoutSession session = checkoutSessionUse.use(hash(token), card, clientIp, deviceId);
        PaymentAuthorizationResult result = flowService.authorizeReady(session.getPaymentId());
        String outcome = outcome(result);
        String[] copy = COPY.get(outcome);
        Payment payment = payment(session.getPaymentId());
        String returnUrl =
                session.getReturnUrl() + "?paymentId=" + payment.getPaymentId() + "&orderRef=" + payment.getOrderRef();
        return new CheckoutResultResponse(String.valueOf(payment.getPaymentId()), outcome, copy[0], copy[1], returnUrl);
    }

    // 구매자에게 보이는 결과 — 카드 승인이 났으면 매입 보류(검토 중)여도 "결제 완료" (S-3, #86)
    // 검토는 뒤에서 하고, 사기로 드러나면 손해는 돈워리가 부담한다. 점수 · 사유 · 검토 여부는 보이지 않는다
    // 승인이 없으면(FDS 거절 · 평가 실패) 결제 불가, 카드사가 거절하면 카드사 거절
    static String outcome(PaymentAuthorizationResult result) {
        if (result.status() == PaymentStatus.DECLINED) {
            return "DECLINED";
        }
        return result.authorizationRef() != null ? "PAID" : "BLOCKED";
    }

    private static final java.util.Map<String, String[]> COPY = java.util.Map.of(
            "PAID", new String[] {"결제가 완료되었습니다", "주문이 확정되었습니다. CakeShop에서 픽업 일정을 확인해 주세요."},
            "BLOCKED", new String[] {"결제를 진행할 수 없습니다", "카드에 청구되지 않았습니다. 다른 결제 수단을 이용하시거나 CakeShop 고객센터로 문의해 주세요."},
            "DECLINED", new String[] {"카드사에서 승인하지 않았습니다", "카드에 청구되지 않았습니다. 카드사에 문의하시거나 다른 카드로 결제해 주세요."});

    private Payment payment(Long paymentId) {
        return paymentRepository
                .findById(paymentId)
                .orElseThrow(() -> new PaymentException(PaymentErrorCode.PAYMENT_NOT_FOUND));
    }

    // m***@example.com
    static String maskEmail(String email) {
        if (email == null || !email.contains("@")) {
            return "";
        }
        int at = email.indexOf('@');
        return email.charAt(0) + "***" + email.substring(at);
    }

    private static String newToken() {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
