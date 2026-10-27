package com.donworry.payment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.donworry.identity.api.IpLocator;
import java.util.Optional;
import org.junit.jupiter.api.Test;

// 결제창 접속 IP · 기기 정하기 (#98 F-5) — 시연 헤더는 시연 설정이 켜졌을 때 · 이름표에 있는 IP만
class CheckoutClientTests {

    private final IpLocator ipLocator = mock(IpLocator.class);

    @Test
    void 결제창_시연헤더_설정꺼짐_목록밖IP면무시_실제주소사용() {
        when(ipLocator.locate("45.83.64.12"))
                .thenReturn(Optional.of(new IpLocator.IpLocation("45.83.64.12", "NL", "ANONYMOUS", "VPN 대역")));
        when(ipLocator.locate("8.8.8.8")).thenReturn(Optional.empty());
        var off = new CheckoutClient(false, ipLocator);
        var on = new CheckoutClient(true, ipLocator);

        // 운영(설정 꺼짐): 헤더로 IP · 기기를 꾸며도 실제 접속 주소 · 쿠키를 쓴다
        assertThat(off.resolve(new CheckoutClient.Signals("127.0.0.1", "cookie-dev", "45.83.64.12", "fake-dev")))
                .isEqualTo(new CheckoutClient.Client("127.0.0.1", "cookie-dev"));
        // 시연(설정 켜짐): 이름표에 있는 IP와 고른 기기를 쓴다
        assertThat(on.resolve(new CheckoutClient.Signals("127.0.0.1", null, "45.83.64.12", "demo-device-vpn")))
                .isEqualTo(new CheckoutClient.Client("45.83.64.12", "demo-device-vpn"));
        // 시연이어도 이름표 밖 IP는 받지 않는다 (모르는 IP를 아무 나라로 꾸미지 못하게)
        assertThat(on.resolve(new CheckoutClient.Signals("127.0.0.1", "cookie-dev", "8.8.8.8", null)))
                .isEqualTo(new CheckoutClient.Client("127.0.0.1", "cookie-dev"));
    }
}
