package com.donworry.payment.service;

import java.util.Map;
import java.util.Optional;

// 시연 기기 이름표 (#100 F-11) — 테스트 상점 "접속 환경"(frontend config/demoEnvironments.ts)과 같은 기기 값
// 실제 기기는 이름을 모른다(빈 값) — 화면은 "설명 없음"으로 보인다
// 처음 온 손님(#100 S-4)은 기기 값 뒤에 손님 번호가 붙는다 (예: demo-device-attacker-ab12cd34) → 같은 이름표
public final class DemoDevice {

    private DemoDevice() {}

    static final Map<String, String> LABELS = Map.of(
            "demo-device-minsu-laptop", "김민수 집 노트북",
            "demo-device-minsu-newphone", "김민수 새 휴대폰 (처음 보는 기기)",
            "demo-device-attacker", "처음 보는 기기 (해외 VPN 접속)",
            "demo-device-tor", "처음 보는 기기 (Tor 접속)");

    public static Optional<String> labelOf(String deviceId) {
        if (deviceId == null) {
            return Optional.empty();
        }
        if (LABELS.containsKey(deviceId)) {
            return Optional.of(LABELS.get(deviceId));
        }
        return LABELS.entrySet().stream()
                .filter(e -> deviceId.startsWith(e.getKey() + "-"))
                .map(e -> e.getValue())
                .findFirst();
    }
}
