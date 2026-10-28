package com.donworry.identity.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 로그인 시도 한 번 (#102) — 성공 · 실패 · 잠김 모두. 고치거나 지우지 않는다
@Entity
@Table(name = "staff_login_events")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StaffLoginEvent {

    static final int MAX_USER_AGENT = 300;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "login_event_id")
    private Long loginEventId;

    // 없는 아이디면 null
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "login_id_attempted", nullable = false, length = 100)
    private String loginIdAttempted;

    @Column(name = "client_ip", nullable = false, length = 45)
    private String clientIp;

    @Column(name = "device_id", length = 100)
    private String deviceId;

    @Column(name = "user_agent", length = MAX_USER_AGENT)
    private String userAgent;

    @Enumerated(EnumType.STRING)
    @Column(name = "result", nullable = false, length = 30)
    private LoginResult result;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    public static StaffLoginEvent of(
            Long userId, String loginId, String clientIp, String userAgent, LoginResult result, Instant occurredAt) {
        var event = new StaffLoginEvent();
        event.userId = userId;
        event.loginIdAttempted = loginId.length() > 100 ? loginId.substring(0, 100) : loginId;
        event.clientIp = clientIp;
        event.userAgent = userAgent == null || userAgent.length() <= MAX_USER_AGENT
                ? userAgent
                : userAgent.substring(0, MAX_USER_AGENT);
        event.result = result;
        event.occurredAt = occurredAt;
        return event;
    }
}
