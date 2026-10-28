package com.donworry.identity.dto;

import jakarta.validation.constraints.NotBlank;
import java.time.Instant;

// 재인증 (#102) — 1차 MVP는 비밀번호를 다시 넣는다 (OTP는 2차)
public final class ReauthDtos {

    private ReauthDtos() {}

    public record ReauthRequest(@NotBlank String password) {}

    public record ReauthTicketResponse(String reauthToken, Instant expiresAt) {}
}
