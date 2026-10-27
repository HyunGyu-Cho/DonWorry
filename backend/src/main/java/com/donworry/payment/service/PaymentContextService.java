package com.donworry.payment.service;

import com.donworry.identity.api.IpLocator;
import com.donworry.payment.api.PaymentLookup;
import com.donworry.payment.dto.PaymentContextResponse;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 결제 정보 화면 (#82 · #100 F-11) — 접속 IP는 IP 이름표로 나라 · 회선 · 설명을, 기기는 시연 이름표로 이름을 붙인다
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PaymentContextService {

    private final PaymentLookup paymentLookup;
    private final IpLocator ipLocator;

    public Optional<PaymentContextResponse> context(Long paymentId) {
        return paymentLookup.find(paymentId).map(payment -> {
            var ip = ipLocator
                    .locate(payment.clientIp())
                    .map(l -> new PaymentContextResponse.IpInfo(l.ipAddress(), l.countryCode(), l.ipType(), l.label()))
                    .orElse(null);
            return PaymentContextResponse.from(
                    payment, ip, DemoDevice.labelOf(payment.deviceId()).orElse(null));
        });
    }
}
