package com.donworry.identity.service;

import com.donworry.identity.api.Reauthentication;
import com.donworry.identity.repository.PlatformUserRepository;
import com.donworry.identity.security.SessionUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.io.Serializable;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

// 재인증 표 (#102, ADR-0024) — 로그인한 직원이 비밀번호를 다시 넣으면 5분 · 1회용 표를 준다
// 표는 그 직원의 서버 세션에만 둔다 → 다른 직원 세션에서는 같은 문자열을 보내도 통과하지 않는다
@Service
public class ReauthService implements Reauthentication {

    static final Duration VALID_FOR = Duration.ofMinutes(5);
    static final String SESSION_KEY = "donworry.reauth.tickets";

    private final PlatformUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    @Autowired
    public ReauthService(PlatformUserRepository userRepository, PasswordEncoder passwordEncoder) {
        this(userRepository, passwordEncoder, Clock.systemUTC());
    }

    ReauthService(PlatformUserRepository userRepository, PasswordEncoder passwordEncoder, Clock clock) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.clock = clock;
    }

    public record Ticket(String reauthToken, Instant expiresAt) {}

    record Grant(Long userId, Instant expiresAt) implements Serializable {}

    // 비밀번호가 틀리면 빈 값
    public Optional<Ticket> issue(HttpSession session, Long userId, String password) {
        boolean matches = password != null
                && userRepository
                        .findById(userId)
                        .map(user -> passwordEncoder.matches(password, user.getPasswordHash()))
                        .orElse(false);
        if (!matches) {
            return Optional.empty();
        }
        Instant now = clock.instant();
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Map<String, Grant> grants = grants(session);
        grants.values().removeIf(grant -> !grant.expiresAt().isAfter(now));
        grants.put(token, new Grant(userId, now.plus(VALID_FOR)));
        session.setAttribute(SESSION_KEY, grants);
        return Optional.of(new Ticket(token, now.plus(VALID_FOR)));
    }

    // 표는 확인하는 순간 지운다 (통과 여부와 상관없이 다시 못 씀)
    boolean consume(HttpSession session, Long userId, String token) {
        if (session == null || userId == null || token == null) {
            return false;
        }
        Map<String, Grant> grants = grants(session);
        Grant grant = grants.remove(token);
        session.setAttribute(SESSION_KEY, grants);
        return grant != null
                && grant.userId().equals(userId)
                && grant.expiresAt().isAfter(clock.instant());
    }

    @Override
    public boolean consume(String reauthToken) {
        if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes)) {
            return false;
        }
        HttpServletRequest request = attributes.getRequest();
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof SessionUser user)) {
            return false;
        }
        return consume(request.getSession(false), user.userId(), reauthToken);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Grant> grants(HttpSession session) {
        Object saved = session.getAttribute(SESSION_KEY);
        return saved instanceof Map<?, ?> map ? new HashMap<>((Map<String, Grant>) map) : new HashMap<>();
    }
}
