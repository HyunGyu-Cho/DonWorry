package com.donworry.identity.api;

import java.util.Optional;

// 접속 IP가 어느 나라 · 어떤 회선인지 찾는 공개 경계 (#98 F-5) — 지금은 시연 이름표(demo_fake_ips)
// 이름표에 없는 IP는 빈 값. 모르는 IP를 "국내"나 "안전"으로 추정하지 않는다
public interface IpLocator {

    Optional<IpLocation> locate(String ipAddress);

    // ipType: OFFICE(사내망) · DOMESTIC(국내) · FOREIGN(해외) · ANONYMOUS(VPN · Tor). label은 화면 설명
    record IpLocation(String ipAddress, String countryCode, String ipType, String label) {}
}
