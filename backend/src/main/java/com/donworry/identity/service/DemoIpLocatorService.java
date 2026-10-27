package com.donworry.identity.service;

import com.donworry.identity.api.IpLocator;
import com.donworry.identity.repository.DemoFakeIpRepository;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// IP 이름표 조회 (#98 F-5) — 시연 시드 demo_fake_ips에서 찾는다
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DemoIpLocatorService implements IpLocator {

    private final DemoFakeIpRepository repository;

    @Override
    public Optional<IpLocation> locate(String ipAddress) {
        if (ipAddress == null || ipAddress.isBlank()) {
            return Optional.empty();
        }
        return repository
                .findByIpAddress(ipAddress.trim())
                .map(ip -> new IpLocation(ip.getIpAddress(), ip.getCountryCode(), ip.getIpType(), ip.getLabel()));
    }
}
