package com.donworry.payment.service;

import com.donworry.identity.api.IpLocator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

// 결제창이 받은 접속 IP · 기기 (#98 F-5) — 기본은 실제 접속 주소 · 결제창 쿠키
// 시연 설정(donworry.demo.fake-client-ip)이 켜졌을 때만 테스트 상점이 고른 "접속 환경" 헤더를 쓴다. 이름표 밖 IP는 무시
@Component
class CheckoutClient {

    static final int MAX_DEVICE_LENGTH = 100;

    private final boolean fakeClientEnabled;
    private final IpLocator ipLocator;

    CheckoutClient(@Value("${donworry.demo.fake-client-ip:false}") boolean fakeClientEnabled, IpLocator ipLocator) {
        this.fakeClientEnabled = fakeClientEnabled;
        this.ipLocator = ipLocator;
    }

    record Signals(String remoteAddr, String deviceCookie, String demoIp, String demoDevice) {}

    record Client(String ip, String deviceId) {}

    Client resolve(Signals signals) {
        String ip = signals.remoteAddr();
        String device = signals.deviceCookie();
        if (fakeClientEnabled) {
            if (signals.demoIp() != null && ipLocator.locate(signals.demoIp()).isPresent()) {
                ip = signals.demoIp().trim();
            }
            if (signals.demoDevice() != null
                    && !signals.demoDevice().isBlank()
                    && signals.demoDevice().length() <= MAX_DEVICE_LENGTH) {
                device = signals.demoDevice().trim();
            }
        }
        return new Client(ip, device);
    }
}
