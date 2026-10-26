package com.donworry.investigation.report.controller;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

// ai-server ↔ Spring 서비스 키 확인 (X-Service-Key) — /internal/ai/** 컨트롤러가 같이 쓴다
// 서버에 키가 없으면 열어 두지 않고 503, 없거나 틀리면 401
final class ServiceKeyCheck {

    private ServiceKeyCheck() {}

    static <T> Optional<ResponseEntity<T>> reject(String configured, String given) {
        if (configured == null || configured.isBlank()) {
            return Optional.of(
                    ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build());
        }
        if (given == null
                || !MessageDigest.isEqual(
                        given.getBytes(StandardCharsets.UTF_8), configured.getBytes(StandardCharsets.UTF_8))) {
            return Optional.of(ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
        }
        return Optional.empty();
    }
}
