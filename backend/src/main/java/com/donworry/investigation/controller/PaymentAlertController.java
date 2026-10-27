package com.donworry.investigation.controller;

import com.donworry.fds.api.FdsResult;
import com.donworry.investigation.dto.InvestigationViewDtos.PaymentAlertDetail;
import com.donworry.investigation.dto.InvestigationViewDtos.PaymentAlertPage;
import com.donworry.investigation.service.PaymentAlertService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// 결제 경보 화면용 (#82) — /api/fds/evaluations와 같은 조건 · 모양에 결제 · 사건 칸을 더한다
@RestController
@RequestMapping("/api/investigation/payment-alerts")
@RequiredArgsConstructor
public class PaymentAlertController {

    private final PaymentAlertService paymentAlertService;

    @GetMapping
    public PaymentAlertPage list(
            @RequestParam(required = false) FdsResult result,
            @RequestParam(defaultValue = "false") boolean attentionOnly,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return paymentAlertService.list(
                result, attentionOnly, search, Math.max(page, 0), Math.min(Math.max(size, 1), 100));
    }

    @GetMapping("/{evaluationId}")
    public ResponseEntity<PaymentAlertDetail> detail(@PathVariable Long evaluationId) {
        return ResponseEntity.of(paymentAlertService.detail(evaluationId));
    }
}
