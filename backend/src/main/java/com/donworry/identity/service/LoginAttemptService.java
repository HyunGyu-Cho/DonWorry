package com.donworry.identity.service;

import com.donworry.identity.api.StaffLoginRecorded;
import com.donworry.identity.entity.LoginResult;
import com.donworry.identity.entity.PlatformUser;
import com.donworry.identity.entity.StaffLoginEvent;
import com.donworry.identity.repository.PlatformUserRepository;
import com.donworry.identity.repository.StaffLoginEventRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 로그인 시도 기록 · 연속 실패 잠금 (#102) — 비밀번호 확인 자체는 Spring Security가 한다
@Service
@RequiredArgsConstructor
public class LoginAttemptService {

    private final PlatformUserRepository userRepository;
    private final StaffLoginEventRepository eventRepository;
    private final ApplicationEventPublisher events;
    private final Clock clock = Clock.systemUTC();

    public record Client(String ip, String userAgent) {}

    // 잠긴 계정이면 잠금 끝 시각 (비밀번호를 확인하기 전에 본다 — 잠긴 동안은 맞는 비밀번호도 거절)
    @Transactional(readOnly = true)
    public Optional<LocalDateTime> lockedUntil(String loginId) {
        LocalDateTime now = LocalDateTime.now(clock);
        return userRepository
                .findByLoginId(loginId)
                .filter(user -> user.isLocked(now))
                .map(PlatformUser::getLockedUntil);
    }

    @Transactional
    public void recordLocked(String loginId, Client client) {
        userRepository
                .findByLoginId(loginId)
                .ifPresent(user -> record(user, loginId, client, LoginResult.LOCKED, false));
    }

    @Transactional
    public void recordSuccess(String loginId, Client client) {
        userRepository.findByLoginId(loginId).ifPresent(user -> {
            user.recordSuccessfulLogin();
            record(user, loginId, client, LoginResult.SUCCESS, false);
        });
    }

    // 없는 아이디도 기록한다 (분산 대입 공격 흔적). 있는 계정이면 실패를 세고 5번째에 잠근다
    @Transactional
    public void recordFailure(String loginId, Client client) {
        Optional<PlatformUser> found = userRepository.findByLoginId(loginId);
        if (found.isEmpty()) {
            eventRepository.save(StaffLoginEvent.of(
                    null, loginId, client.ip(), client.userAgent(), LoginResult.UNKNOWN_USER, Instant.now(clock)));
            return;
        }
        PlatformUser user = found.get();
        boolean lockedNow = user.recordFailedLogin(LocalDateTime.now(clock));
        record(user, loginId, client, LoginResult.BAD_PASSWORD, lockedNow);
    }

    private void record(PlatformUser user, String loginId, Client client, LoginResult result, boolean lockedNow) {
        Instant now = Instant.now(clock);
        eventRepository.save(
                StaffLoginEvent.of(user.getUserId(), loginId, client.ip(), client.userAgent(), result, now));
        events.publishEvent(new StaffLoginRecorded(
                user.getUserId(), loginId, user.getRole().name(), result.name(), lockedNow, client.ip(), now));
    }
}
