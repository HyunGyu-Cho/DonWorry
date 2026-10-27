package com.donworry.payment.service;

import com.donworry.fds.api.FdsPaymentEvaluations;
import com.donworry.fds.api.FdsResult;
import com.donworry.payment.dto.OwnerViewDtos.OwnerResult;
import com.donworry.payment.entity.Payment;
import com.donworry.payment.entity.PaymentStatus;
import com.donworry.payment.repository.PaymentRepository;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 사장님 보안 확인 결과 (#86) — FDS가 걸러 본(직원 확인 · 거절) 우리 가게 결제만
// 검토 중이어도 판매는 막지 않는다 — 사기로 드러나면 손해는 돈워리가 부담 (S-3)
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OwnerResultService {

    private static final Map<String, String> GUIDE = Map.of(
            "CHECKING",
            "카드 승인이 완료된 결제예요. 돈워리가 안전 확인 중이지만 주문은 그대로 진행하셔도 됩니다. 문제가 생기면 손해는 돈워리가 부담해요.",
            "ACCEPTED",
            "확인이 끝나 결제가 완료되었습니다. 정산 일정에 들어가요.",
            "REJECTED",
            "돈워리가 결제를 취소했습니다. 구매자에게 청구되지 않습니다. 이미 판매했다면 손해는 돈워리가 부담해요.",
            "AUTO_BLOCKED",
            "결제 전에 중단되어 구매자에게 청구되지 않았습니다. 주문을 진행하지 마세요.");

    private final PaymentRepository paymentRepository;
    private final FdsPaymentEvaluations fdsPaymentEvaluations;

    public List<OwnerResult> list(Long merchantId, String result) {
        return paymentRepository.findByMerchantIdOrderByCreatedAtDesc(merchantId).stream()
                .filter(this::checkedByFds)
                .map(payment -> resultOf(payment).map(r -> view(payment, r)))
                .flatMap(Optional::stream)
                .filter(row -> result == null || row.result().equals(result))
                .toList();
    }

    // 정상 통과(ALLOW) 결제는 보안 확인 결과에 넣지 않는다
    private boolean checkedByFds(Payment payment) {
        return fdsPaymentEvaluations
                .latestForPayment(payment.getPaymentId())
                .map(e -> e.result() == FdsResult.REVIEW || e.result() == FdsResult.DENY)
                .orElse(false);
    }

    private static Optional<String> resultOf(Payment payment) {
        PaymentStatus status = payment.getStatus();
        if (status == PaymentStatus.HELD) {
            return Optional.of("CHECKING");
        }
        if (status == PaymentStatus.VOIDED) {
            return Optional.of("REJECTED");
        }
        if (status == PaymentStatus.DENIED) {
            return Optional.of("AUTO_BLOCKED");
        }
        boolean authorized = payment.getAuthorizationRef() != null;
        if (authorized && (status == PaymentStatus.CAPTURED || status == PaymentStatus.PENDING)) {
            return Optional.of("ACCEPTED");
        }
        return Optional.empty();
    }

    private static OwnerResult view(Payment payment, String result) {
        return new OwnerResult(
                String.valueOf(payment.getPaymentId()),
                payment.getOrderRef(),
                payment.getOrderTitle(),
                payment.getAmount(),
                result,
                payment.getStatus().name(),
                payment.getCreatedAt(),
                GUIDE.get(result));
    }
}
