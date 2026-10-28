package com.donworry.identity.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import com.donworry.identity.entity.PlatformUser;
import com.donworry.identity.repository.PlatformUserRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

// 재인증 표 (#102) — 비밀번호를 다시 넣으면 5분 · 1회용 표, 그 직원 세션에서만 통과
class ReauthServiceTests {

    static final Long JIWON = 4L;
    static final Long YUNSEO = 5L;

    final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
    final MutableClock clock = new MutableClock(Instant.parse("2026-10-28T01:00:00Z"));
    final PlatformUserRepository users = mock(PlatformUserRepository.class);
    final ReauthService service = new ReauthService(users, encoder, clock);

    @Test
    void 재인증표_5분_1회용_다른직원것못씀_틀린비밀번호면안줌() {
        givenUser(JIWON, "1234");
        var jiwonSession = new MockHttpSession();
        var yunseoSession = new MockHttpSession();

        // 틀린 비밀번호면 표를 주지 않는다
        assertThat(service.issue(jiwonSession, JIWON, "0000")).isEmpty();

        // 한 번 쓰면 끝
        String token = service.issue(jiwonSession, JIWON, "1234").orElseThrow().reauthToken();
        assertThat(service.consume(jiwonSession, JIWON, token)).isTrue();
        assertThat(service.consume(jiwonSession, JIWON, token)).isFalse();

        // 다른 직원 세션 · 다른 직원 번호로는 통과하지 않는다
        String stolen = service.issue(jiwonSession, JIWON, "1234").orElseThrow().reauthToken();
        assertThat(service.consume(yunseoSession, YUNSEO, stolen)).isFalse();
        assertThat(service.consume(jiwonSession, YUNSEO, stolen)).isFalse();

        // 5분이 지나면 못 쓴다
        String late = service.issue(jiwonSession, JIWON, "1234").orElseThrow().reauthToken();
        clock.advance(Duration.ofMinutes(5));
        assertThat(service.consume(jiwonSession, JIWON, late)).isFalse();
    }

    private void givenUser(Long userId, String password) {
        var user = mock(PlatformUser.class);
        given(user.getPasswordHash()).willReturn(encoder.encode(password));
        given(users.findById(userId)).willReturn(Optional.of(user));
    }

    static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
