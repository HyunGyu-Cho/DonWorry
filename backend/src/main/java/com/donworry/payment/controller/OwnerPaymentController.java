package com.donworry.payment.controller;

import com.donworry.identity.api.CurrentUser;
import com.donworry.payment.dto.OwnerViewDtos.NotificationView;
import com.donworry.payment.dto.OwnerViewDtos.OwnerResult;
import com.donworry.payment.service.NotificationQueryService;
import com.donworry.payment.service.OwnerResultService;
import com.donworry.payment.service.PaymentErrorCode;
import com.donworry.payment.service.PaymentException;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// 사장님 화면 · 메일 발송 기록 (#86) — 가맹점은 로그인한 계정으로 정한다 (요청 값으로 받지 않음)
@RestController
@RequestMapping("/api/payment")
@RequiredArgsConstructor
public class OwnerPaymentController {

    private final CurrentUser currentUser;
    private final OwnerResultService ownerResultService;
    private final NotificationQueryService notificationQueryService;

    @GetMapping("/owner/results")
    public List<OwnerResult> ownerResults(@RequestParam(required = false) String result) {
        Long merchantId = currentUser
                .get()
                .map(CurrentUser.UserView::merchantId)
                .orElseThrow(() -> new PaymentException(PaymentErrorCode.MERCHANT_LOGIN_REQUIRED));
        return ownerResultService.list(merchantId, result);
    }

    // 사장님이면 우리 가게 것만, 보안 직원(가맹점 없음)이면 전부
    @GetMapping("/notifications")
    public List<NotificationView> notifications(
            @RequestParam(required = false) String recipientType, @RequestParam(required = false) Long paymentId) {
        Long merchantId =
                currentUser.get().map(CurrentUser.UserView::merchantId).orElse(null);
        return notificationQueryService.list(merchantId, recipientType, paymentId);
    }
}
