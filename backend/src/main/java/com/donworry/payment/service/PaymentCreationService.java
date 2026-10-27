package com.donworry.payment.service;

import com.donworry.fds.api.FdsCountWindows;
import com.donworry.identity.api.IpLocator;
import com.donworry.payment.entity.Payment;
import com.donworry.payment.repository.PaymentRepository;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PaymentCreationService {

    private final PaymentRepository paymentRepository;
    private final IpLocator ipLocator;
    private final FdsCountWindows countWindows;

    // 후속 평가·승인 흐름이 롤백돼도 최초 접수 기록은 남긴다.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long createPending(Long merchantId, String customerRef, String orderRef, Long amount) {
        return savePending(merchantId, customerRef, orderRef, amount).getPaymentId();
    }

    // Spring Bean 호출이 반환되면 커밋된 결제의 값으로 후속 평가를 구성한다.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public PaymentCreationSnapshot createPendingSnapshot(
            Long merchantId, String customerRef, String orderRef, Long amount) {
        return PaymentCreationSnapshot.from(savePending(merchantId, customerRef, orderRef, amount));
    }

    private Payment savePending(Long merchantId, String customerRef, String orderRef, Long amount) {
        Payment payment = Payment.pending(merchantId, customerRef, orderRef, amount, Instant.now());
        return paymentRepository.save(payment);
    }

    // 저장된 결제를 다시 읽는다 — 결제창 결제는 준비 때 이미 저장했다 (#82)
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public PaymentCreationSnapshot snapshot(Long paymentId) {
        return paymentRepository
                .findById(paymentId)
                .map(PaymentCreationSnapshot::from)
                .orElseThrow(() -> new PaymentException(PaymentErrorCode.PAYMENT_NOT_FOUND));
    }

    // FDS 입력값 (#82 · #96): 결제 정보(가맹점 · 카드 · 기기 · IP · 이메일)와 이 고객의 이력
    // 과거 정상 결제 = 같은 가맹점 · 같은 고객의 매입 완료(CAPTURED) — 승인만 된 보류 · 취소 결제는 치지 않는다
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Features features(Long paymentId) {
        Payment payment = paymentRepository
                .findById(paymentId)
                .orElseThrow(() -> new PaymentException(PaymentErrorCode.PAYMENT_NOT_FOUND));
        boolean hasPriorCaptured =
                paymentRepository.countCaptured(payment.getMerchantId(), payment.getCustomerRef()) > 0;
        Integer cardCount = payment.getCardFingerprint() == null
                ? null
                : (int) paymentRepository.countCapturedWithCard(
                        payment.getMerchantId(), payment.getCustomerRef(), payment.getCardFingerprint());
        Integer deviceCount = payment.getDeviceId() == null
                ? null
                : (int) paymentRepository.countCapturedWithDevice(
                        payment.getMerchantId(), payment.getCustomerRef(), payment.getDeviceId());
        // 시간 창 기록 (#98) — "시도"는 결제창에서 카드를 붙인 결제, 시각은 결제 요청 시각. 기간은 P2 기준값
        var windows = countWindows.current();
        Instant at = payment.getCreatedAt();
        int customerAttempts = (int) paymentRepository.countAttempts(
                payment.getMerchantId(), payment.getCustomerRef(), at.minus(windows.customerAttempts()), at);
        Integer cardDeclines = payment.getCardFingerprint() == null
                ? null
                : (int) paymentRepository.countDeclinesWithCard(
                        payment.getCardFingerprint(), payment.getPaymentId(), at.minus(windows.cardDeclines()), at);
        Integer ipCards = payment.getClientIp() == null
                ? null
                : (int) paymentRepository.countCardsFromIp(payment.getClientIp(), at.minus(windows.ipCards()), at);
        // 접속 IP의 나라 · 회선 종류 (#98) — 이름표에 없으면 null (R05 확인 불가)
        var location = ipLocator.locate(payment.getClientIp());
        return new Features(
                payment.getMerchantId(),
                payment.getCardFingerprint(),
                payment.getDeviceId(),
                payment.getClientIp(),
                location.map(IpLocator.IpLocation::countryCode).orElse(null),
                location.map(IpLocator.IpLocation::ipType).orElse(null),
                payment.getBuyerEmail(),
                hasPriorCaptured,
                cardCount,
                deviceCount,
                customerAttempts,
                cardDeclines,
                ipCards);
    }

    public record Features(
            Long merchantId,
            String cardFingerprint,
            String deviceId,
            String clientIp,
            String clientCountry,
            String clientIpType,
            String buyerEmail,
            Boolean hasPriorCapturedPayment,
            Integer cardCompletedPayments,
            Integer deviceCompletedPayments,
            Integer recentCustomerAttempts,
            Integer recentCardDeclines,
            Integer recentIpCards) {}
}
