package com.donworry.identity.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 시연용 IP 이름표 (demo_fake_ips 시드) — 읽기만 (#98 F-5). 실제 GeoIP 파일로 바꿀 때는 IpLocator 구현만 바꾼다
@Entity
@Table(name = "demo_fake_ips")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DemoFakeIp {

    @Id
    @Column(name = "demo_ip_id")
    private Long demoIpId;

    @Column(name = "ip_address", nullable = false, length = 45)
    private String ipAddress;

    // ISO 국가 코드
    @Column(name = "country_code", nullable = false, length = 2, columnDefinition = "CHAR(2)")
    private String countryCode;

    // OFFICE / DOMESTIC / FOREIGN / ANONYMOUS
    @Column(name = "ip_type", nullable = false, length = 20)
    private String ipType;

    @Column(name = "label", nullable = false, length = 100)
    private String label;
}
