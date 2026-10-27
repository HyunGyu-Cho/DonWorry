package com.donworry.payment.repository;

import com.donworry.payment.entity.Notification;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

public interface NotificationRepository extends Repository<Notification, Long> {

    Notification save(Notification notification);

    Optional<Notification> findByConfirmTokenHash(String confirmTokenHash);

    Optional<Notification> findFirstByPaymentIdAndKindOrderByCreatedAtDesc(Long paymentId, String kind);

    List<Notification> findAllByOrderByCreatedAtDesc();

    List<Notification> findByPaymentIdInOrderByCreatedAtDesc(java.util.Collection<Long> paymentIds);
}
