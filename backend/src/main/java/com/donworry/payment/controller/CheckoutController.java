package com.donworry.payment.controller;

import com.donworry.payment.dto.CheckoutDtos.CheckoutResultResponse;
import com.donworry.payment.dto.CheckoutDtos.CheckoutSessionResponse;
import com.donworry.payment.dto.CheckoutDtos.DemoCardResponse;
import com.donworry.payment.dto.CheckoutDtos.PayRequest;
import com.donworry.payment.service.CheckoutService;
import com.donworry.payment.service.DemoCard;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// 돈워리 결제창 (cakeshop-contract 4절) — 로그인 없이 결제창 토큰으로만
@RestController
@RequestMapping("/api/checkout")
@RequiredArgsConstructor
public class CheckoutController {

    private final CheckoutService checkoutService;

    // 경로 변수 {token}보다 먼저 잡힌다 (고정 경로가 우선)
    @GetMapping("/demo-cards")
    public List<DemoCardResponse> demoCards() {
        return DemoCard.ALL.stream()
                .map(card ->
                        new DemoCardResponse(card.cardToken(), card.label(), "**** " + card.last4(), card.country()))
                .toList();
    }

    @GetMapping("/{token}")
    public CheckoutSessionResponse session(@PathVariable String token) {
        return checkoutService.view(token);
    }

    // 접속 IP는 요청 주소 그대로 (믿을 수 있는 중계 서버의 X-Forwarded-For는 2-4), 기기는 결제창 쿠키
    @PostMapping("/{token}/pay")
    public CheckoutResultResponse pay(
            @PathVariable String token,
            @RequestBody PayRequest request,
            @CookieValue(name = "dw_device", required = false) String deviceId,
            HttpServletRequest http) {
        return checkoutService.pay(token, request.cardToken(), http.getRemoteAddr(), deviceId);
    }
}
