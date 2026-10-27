package com.donworry.payment.repository;

import com.donworry.payment.entity.CheckoutSession;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface CheckoutSessionRepository extends Repository<CheckoutSession, Long> {

    CheckoutSession save(CheckoutSession session);

    Optional<CheckoutSession> findByTokenHash(String tokenHash);

    // 같은 결제창에서 결제를 두 번 누르면 하나만 지나가게 잠근다
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from CheckoutSession s where s.tokenHash = :tokenHash")
    Optional<CheckoutSession> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);
}
