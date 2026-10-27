package com.donworry.payment.repository;

import com.donworry.payment.entity.BuyerConfirmation;
import java.util.Optional;
import org.springframework.data.repository.Repository;

public interface BuyerConfirmationRepository extends Repository<BuyerConfirmation, Long> {

    BuyerConfirmation saveAndFlush(BuyerConfirmation confirmation);

    Optional<BuyerConfirmation> findByNotificationId(Long notificationId);

    Optional<BuyerConfirmation> findFirstByPaymentIdOrderByRespondedAtDesc(Long paymentId);
}
