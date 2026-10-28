package com.donworry.payment.service;

import com.donworry.payment.api.PaymentLookup;
import com.donworry.payment.entity.Payment;
import com.donworry.payment.repository.PaymentRepository;
import java.time.Instant;
import java.util.Collection;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
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
    public Optional<BlockValues> blockValues(Long paymentId) {
        return paymentRepository
                .findById(paymentId)
                .map(p -> new BlockValues(
                        p.getCardFingerprint(), p.getCardLast4(), p.getDeviceId(), p.getClientIp(), p.getBuyerEmail()));
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

    @Override
    public Map<Long, Set<SharedValue>> sharedValues(Long paymentId, Collection<Long> candidatePaymentIds) {
        if (candidatePaymentIds == null || candidatePaymentIds.isEmpty()) {
            return Map.of();
        }
        Optional<Payment> found = paymentRepository.findById(paymentId);
        if (found.isEmpty()) {
            return Map.of();
        }
        Payment payment = found.get();
        Map<Long, Set<SharedValue>> result = new LinkedHashMap<>();
        for (Payment other : paymentRepository.findByPaymentIdIn(candidatePaymentIds)) {
            if (other.getPaymentId().equals(paymentId)) {
                continue;
            }
            Set<SharedValue> same = EnumSet.noneOf(SharedValue.class);
            if (sameValue(payment.getCardFingerprint(), other.getCardFingerprint())) {
                same.add(SharedValue.CARD);
            }
            if (sameValue(payment.getDeviceId(), other.getDeviceId())) {
                same.add(SharedValue.DEVICE);
            }
            if (sameValue(payment.getClientIp(), other.getClientIp())) {
                same.add(SharedValue.IP);
            }
            if (sameValue(email(payment.getBuyerEmail()), email(other.getBuyerEmail()))) {
                same.add(SharedValue.EMAIL);
            }
            if (Objects.equals(payment.getMerchantId(), other.getMerchantId())
                    && sameValue(payment.getCustomerRef(), other.getCustomerRef())) {
                same.add(SharedValue.CUSTOMER);
            }
            if (!same.isEmpty()) {
                result.put(other.getPaymentId(), same);
            }
        }
        return result;
    }

    // 값이 없으면 같다고 보지 않는다 (모르는 값끼리 겹친 것으로 세지 않음)
    private static boolean sameValue(String a, String b) {
        return a != null && !a.isBlank() && a.equals(b);
    }

    // 이메일은 대소문자 · 앞뒤 공백을 가리지 않는다 (차단 목록 대조와 같은 규칙)
    private static String email(String value) {
        return value == null ? null : value.trim().toLowerCase(Locale.ROOT);
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
