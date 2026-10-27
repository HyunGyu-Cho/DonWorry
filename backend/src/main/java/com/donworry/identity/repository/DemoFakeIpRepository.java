package com.donworry.identity.repository;

import com.donworry.identity.entity.DemoFakeIp;
import java.util.Optional;
import org.springframework.data.repository.Repository;

public interface DemoFakeIpRepository extends Repository<DemoFakeIp, Long> {

    Optional<DemoFakeIp> findByIpAddress(String ipAddress);
}
