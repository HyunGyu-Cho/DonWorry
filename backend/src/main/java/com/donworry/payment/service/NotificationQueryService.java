package com.donworry.payment.service;

import com.donworry.payment.dto.OwnerViewDtos.NotificationView;
import com.donworry.payment.entity.Notification;
import com.donworry.payment.entity.Payment;
import com.donworry.payment.repository.NotificationRepository;
import com.donworry.payment.repository.PaymentRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 메일 발송 기록 (#86) — 본문은 저장하지 않는다. 사장님은 우리 가게 결제 메일만, 보안 직원은 전부
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class NotificationQueryService {

    private final NotificationRepository notificationRepository;
    private final PaymentRepository paymentRepository;

    public List<NotificationView> list(Long merchantId, String recipientType, Long paymentId) {
        List<Notification> rows = merchantId == null
                ? notificationRepository.findAllByOrderByCreatedAtDesc()
                : notificationRepository.findByPaymentIdInOrderByCreatedAtDesc(
                        paymentRepository.findByMerchantIdOrderByCreatedAtDesc(merchantId).stream()
                                .map(Payment::getPaymentId)
                                .toList());
        return rows.stream()
                .filter(n -> recipientType == null || recipientType.equals(n.getRecipientType()))
                .filter(n -> paymentId == null || paymentId.equals(n.getPaymentId()))
                .map(NotificationQueryService::view)
                .toList();
    }

    private static NotificationView view(Notification n) {
        return new NotificationView(
                String.valueOf(n.getNotificationId()),
                n.getPaymentId() == null ? null : String.valueOf(n.getPaymentId()),
                n.getRecipientType(),
                n.getRecipientEmail(),
                n.getKind(),
                n.getSubject(),
                n.getStatus(),
                n.getCreatedAt(),
                n.getSentAt(),
                n.getFailureReason());
    }
}
