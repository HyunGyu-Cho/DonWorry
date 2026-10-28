package com.donworry.identity.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "platform_users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PlatformUser {

    // 비밀번호 5번 연속 실패 → 30분 잠금 (#102, ADR-0024)
    public static final int MAX_FAILED_LOGINS = 5;
    public static final Duration LOCK_DURATION = Duration.ofMinutes(30);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "login_id", nullable = false, length = 100)
    private String loginId;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "display_name", nullable = false, length = 100)
    private String displayName;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private UserStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 30)
    private UserRole role;

    @Column(name = "merchant_id")
    private Long merchantId;

    @Column(name = "created_at", nullable = false)
    // UTC DATETIME 값을 JVM 기본 시간대로 변환하지 않고 그대로 읽고 쓴다
    @JdbcTypeCode(SqlTypes.LOCAL_DATE_TIME)
    private LocalDateTime createdAt;

    @Column(name = "failed_login_count", nullable = false)
    private int failedLoginCount;

    // UTC, 잠금이 없으면 null
    @Column(name = "locked_until")
    @JdbcTypeCode(SqlTypes.LOCAL_DATE_TIME)
    private LocalDateTime lockedUntil;

    public boolean isLocked(LocalDateTime now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }

    // 실패를 한 번 세고, 5번째면 잠근다. 잠그면 횟수를 0으로 → 잠금이 풀린 뒤 다시 5번
    public boolean recordFailedLogin(LocalDateTime now) {
        failedLoginCount++;
        if (failedLoginCount < MAX_FAILED_LOGINS) {
            return false;
        }
        lockedUntil = now.plus(LOCK_DURATION);
        failedLoginCount = 0;
        return true;
    }

    public void recordSuccessfulLogin() {
        failedLoginCount = 0;
        lockedUntil = null;
    }
}
