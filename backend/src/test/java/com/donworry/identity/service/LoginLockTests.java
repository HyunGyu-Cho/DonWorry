package com.donworry.identity.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.donworry.MariaDbTestContainerConfig;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

// 로그인 연속 실패 잠금 · 로그인 기록 (#102) — 시연 계정을 잠그지 않게 테스트마다 새 직원 계정을 만든다
@Tag("mariadb")
@SpringBootTest
@AutoConfigureMockMvc
@Import(MariaDbTestContainerConfig.class)
class LoginLockTests {

    static final String PASSWORD = "right-password";

    @Autowired
    MockMvc mvc;

    @Autowired
    JsonMapper mapper;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    PasswordEncoder encoder;

    @Test
    void 로그인_비밀번호5번연속실패_30분잠금_잠긴동안맞는비밀번호도거절() throws Exception {
        String loginId = newStaff();

        for (int i = 1; i <= 4; i++) {
            login(loginId, "wrong-" + i).andExpect(jsonPath("$.code").value("AUTH_004"));
        }
        LocalDateTime beforeLock = LocalDateTime.now(ZoneOffset.UTC);
        login(loginId, "wrong-5").andExpect(jsonPath("$.code").value("AUTH_004"));

        // 5번째 실패로 30분 잠금 → 맞는 비밀번호도 거절
        LocalDateTime lockedUntil = jdbc.queryForObject(
                "SELECT locked_until FROM platform_users WHERE login_id = ?", LocalDateTime.class, loginId);
        assertThat(Duration.between(beforeLock, lockedUntil)).isBetween(Duration.ofMinutes(29), Duration.ofMinutes(31));
        login(loginId, PASSWORD)
                .andExpect(status().isLocked())
                .andExpect(jsonPath("$.code").value("AUTH_011"));

        // 30분이 지나면 다시 로그인된다
        jdbc.update(
                "UPDATE platform_users SET locked_until = ? WHERE login_id = ?",
                Timestamp.valueOf(LocalDateTime.now(ZoneOffset.UTC).minusSeconds(1)),
                loginId);
        login(loginId, PASSWORD).andExpect(status().isOk());
        assertThat(jdbc.queryForObject(
                        "SELECT failed_login_count FROM platform_users WHERE login_id = ?", Integer.class, loginId))
                .isZero();
    }

    @Test
    void 로그인_성공_실패_잠김이로그인기록에남음() throws Exception {
        String loginId = newStaff();
        String unknownId = "nobody-" + UUID.randomUUID().toString().substring(0, 8);

        login(loginId, PASSWORD).andExpect(status().isOk());
        for (int i = 1; i <= 5; i++) {
            login(loginId, "wrong-" + i);
        }
        login(loginId, PASSWORD).andExpect(status().isLocked());
        login(unknownId, PASSWORD);

        assertThat(results(loginId))
                .containsExactly(
                        "SUCCESS",
                        "BAD_PASSWORD",
                        "BAD_PASSWORD",
                        "BAD_PASSWORD",
                        "BAD_PASSWORD",
                        "BAD_PASSWORD",
                        "LOCKED");
        assertThat(jdbc.queryForList(
                        "SELECT user_id FROM staff_login_events WHERE login_id_attempted = ? AND result = 'UNKNOWN_USER'",
                        Long.class,
                        unknownId))
                .containsExactly((Long) null);
        assertThat(jdbc.queryForList(
                        "SELECT client_ip FROM staff_login_events WHERE login_id_attempted = ?", String.class, loginId))
                .allMatch(ip -> !ip.isBlank());
    }

    private String newStaff() {
        String loginId = "lock-" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.update(
                "INSERT INTO platform_users (login_id, password_hash, display_name, status, role, merchant_id, created_at)"
                        + " VALUES (?, ?, '잠금 테스트', 'ACTIVE', 'SECURITY_STAFF', NULL, UTC_TIMESTAMP(6))",
                loginId,
                encoder.encode(PASSWORD));
        return loginId;
    }

    private List<String> results(String loginId) {
        return jdbc.queryForList(
                "SELECT result FROM staff_login_events WHERE login_id_attempted = ? ORDER BY login_event_id",
                String.class,
                loginId);
    }

    private ResultActions login(String loginId, String password) throws Exception {
        return mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("loginId", loginId, "password", password))));
    }
}
