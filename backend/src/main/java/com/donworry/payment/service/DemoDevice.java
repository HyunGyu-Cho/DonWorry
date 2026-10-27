package com.donworry.payment.service;

import java.util.Map;
import java.util.Optional;

// 시연 기기 이름표 (#100 F-11) — 테스트 상점 "접속 환경"(frontend config/demoEnvironments.ts)과 같은 기기 값
// 실제 기기는 이름을 모른다(빈 값) — 화면은 "설명 없음"으로 보인다
public final class DemoDevice {

    private DemoDevice() {}

    static final Map<String, String> LABELS = Map.of(
            "demo-device-minsu-laptop", "김민수 집 노트북",
            "demo-device-minsu-newphone", "김민수 새 휴대폰 (처음 보는 기기)",
            "demo-device-attacker", "처음 보는 기기 (해외 VPN 접속)",
            "demo-device-tor", "처음 보는 기기 (Tor 접속)");

    public static Optional<String> labelOf(String deviceId) {
        return Optional.ofNullable(deviceId).map(LABELS::get);
    }
}
