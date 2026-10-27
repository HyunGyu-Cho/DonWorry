package com.donworry.payment.service;

import com.donworry.payment.api.PaymentLookup;
import com.donworry.payment.entity.Payment;
import com.donworry.payment.repository.PaymentRepository;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
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
