package com.donworry.payment.controller;

import com.donworry.payment.dto.BuyerConfirmDtos.AnswerRequest;
import com.donworry.payment.dto.BuyerConfirmDtos.ConfirmRequestView;
import com.donworry.payment.dto.BuyerConfirmDtos.ConfirmationView;
import com.donworry.payment.dto.BuyerConfirmDtos.DemoLink;
import com.donworry.payment.service.BuyerConfirmationService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

// 구매자 본인 확인 (#82) — 공개 API는 로그인 없이 메일 속 1회용 링크 토큰으로만
@RestController
@RequiredArgsConstructor
public class BuyerConfirmationController {

    private final BuyerConfirmationService buyerConfirmationService;

    @GetMapping("/api/public/buyer-confirmations/{token}")
    public ConfirmRequestView view(@PathVariable String token) {
        return buyerConfirmationService.view(token);
    }

    @PostMapping("/api/public/buyer-confirmations/{token}")
    public ConfirmationView answer(
            @PathVariable String token, @RequestBody AnswerRequest request, HttpServletRequest http) {
        return buyerConfirmationService.answer(token, request.answer(), http.getRemoteAddr());
    }

    // 시연용: 메일함 대신 사건 화면 버튼이 구매자 화면 링크를 받는다 (메일 발송은 2-23)
    @PostMapping("/api/demo/buyer-confirmations/{paymentId}/link")
    public DemoLink demoLink(@PathVariable Long paymentId) {
        return new DemoLink(buyerConfirmationService.issueDemoLink(paymentId));
    }
}
