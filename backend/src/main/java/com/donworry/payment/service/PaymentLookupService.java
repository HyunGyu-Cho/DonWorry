package com.donworry.payment.service;

import com.donworry.payment.api.PaymentLookup;
import com.donworry.payment.entity.Payment;
import com.donworry.payment.repository.PaymentRepository;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PaymentLookupService implements PaymentLookup {

    private final PaymentRepository paymentRepository;
    private final com.donworry.payment.repository.BuyerConfirmationRepository buyerConfirmationRepository;

    @Override
    public Optional<PaymentView> find(Long paymentId) {
        return paymentRepository.findById(paymentId).map(PaymentLookupService::view);
    }

    @Override
    public Optional<BuyerAnswer> latestBuyerAnswer(Long paymentId) {
        return buyerConfirmationRepository
                .findFirstByPaymentIdOrderByRespondedAtDesc(paymentId)
                .map(confirmation -> new BuyerAnswer(confirmation.getAnswer(), confirmation.getRespondedAt()));
    }

    @Override
    public Optional<CustomerHistory> customerHistory(Long paymentId, int limit) {
        return paymentRepository.findById(paymentId).map(payment -> history(payment, limit));
    }

    private CustomerHistory history(Payment payment, int limit) {
        Long merchantId = payment.getMerchantId();
        String customerRef = payment.getCustomerRef();
        Instant before = payment.getCreatedAt();
        List<PastPayment> recent = paymentRepository
                .findByMerchantIdAndCustomerRefAndCreatedAtBeforeOrderByCreatedAtDesc(
                        merchantId, customerRef, before, Limit.of(limit))
                .stream()
                .map(past -> new PastPayment(
                        past.getAmount(),
                        past.getOrderTitle(),
                        past.getCardLast4(),
                        past.getStatus().name(),
                        past.getCreatedAt()))
                .toList();
        Object[] all = first(paymentRepository.statsBefore(merchantId, customerRef, before));
        long totalCount = all == null ? 0 : ((Number) all[0]).longValue();
        Instant firstAt = all == null ? null : (Instant) all[1];
        // 끝자리를 모르는 결제(결제창을 거치지 않음)는 "모름"으로 묶는다
        Map<String, Long> byCard = new LinkedHashMap<>();
        long count = 0;
        long sum = 0;
        Long max = null;
        for (Object[] row : paymentRepository.capturedByCardBefore(merchantId, customerRef, before)) {
            long cardCount = ((Number) row[1]).longValue();
            long cardMax = ((Number) row[3]).longValue();
            byCard.merge(row[0] == null ? "모름" : (String) row[0], cardCount, Long::sum);
            count += cardCount;
            sum += ((Number) row[2]).longValue();
            max = max == null ? cardMax : Math.max(max, cardMax);
        }
        Long average = count == 0 ? null : Math.round((double) sum / count);
        return new CustomerHistory(recent, totalCount, firstAt, count, average, max, byCard);
    }

    private static Object[] first(List<Object[]> rows) {
        return rows.isEmpty() || rows.get(0)[0] == null ? null : rows.get(0);
    }

    @Override
    public Optional<CardUsage> cardUsage(Long paymentId) {
        return paymentRepository.findById(paymentId).map(payment -> {
            Integer completed = payment.getCardFingerprint() == null
                    ? null
                    : (int) paymentRepository.countCapturedWithCardBefore(
                            payment.getMerchantId(),
                            payment.getCustomerRef(),
                            payment.getCardFingerprint(),
                            payment.getCreatedAt());
            return new CardUsage(
                    payment.getCardLast4(), payment.getCardCountry(), completed, payment.getAuthorizationRef());
        });
    }

    static PaymentView view(Payment payment) {
        return new PaymentView(
                payment.getPaymentId(),
                payment.getMerchantId(),
                payment.getCustomerRef(),
                payment.getOrderRef(),
                payment.getOrderTitle(),
                payment.getAmount(),
                payment.getStatus().name(),
                payment.getCreatedAt(),
                payment.getBuyerName(),
                payment.getBuyerEmail(),
                payment.getCustomerJoinedAt(),
                payment.getClientIp(),
                payment.getDeviceId(),
                payment.getCardLast4(),
                payment.getCardCountry());
    }
}
