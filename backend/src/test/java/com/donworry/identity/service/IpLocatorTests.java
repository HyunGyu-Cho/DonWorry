package com.donworry.identity.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.donworry.MariaDbTestContainerConfig;
import com.donworry.identity.api.IpLocator;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

// 실제 MariaDB의 demo_fake_ips 시드로 IP 이름표를 찾는다 (#98 F-5)
@Tag("mariadb")
@SpringBootTest
@Import(MariaDbTestContainerConfig.class)
class IpLocatorTests {

    @Autowired
    IpLocator ipLocator;

    @Test
    void IpLocator_목록표IP_나라회선_없는IP_빈값() {
        assertThat(ipLocator.locate("45.83.64.12")).hasValueSatisfying(ip -> {
            assertThat(ip.countryCode()).isEqualTo("NL");
            assertThat(ip.ipType()).isEqualTo("ANONYMOUS");
        });
        assertThat(ipLocator.locate(" 121.134.55.10 "))
                .hasValueSatisfying(ip -> assertThat(ip.countryCode()).isEqualTo("KR"));
        assertThat(ipLocator.locate("8.8.8.8")).isEmpty();
        assertThat(ipLocator.locate(null)).isEmpty();
    }
}
