package com.donworry.identity.controller;

import com.donworry.identity.dto.ReauthDtos.ReauthRequest;
import com.donworry.identity.dto.ReauthDtos.ReauthTicketResponse;
import com.donworry.identity.security.SessionUser;
import com.donworry.identity.service.ReauthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/identity")
@RequiredArgsConstructor
public class IdentityController {

    private final ReauthService reauthService;

    // 위험한 조치 직전 비밀번호 다시 확인 → 5분 · 1회용 표 (틀리면 AUTH_010)
    @PostMapping("/reauth")
    public ReauthTicketResponse reauth(
            @AuthenticationPrincipal SessionUser user,
            @Valid @RequestBody ReauthRequest input,
            HttpServletRequest request) {
        return reauthService
                .issue(request.getSession(), user.userId(), input.password())
                .map(ticket -> new ReauthTicketResponse(ticket.reauthToken(), ticket.expiresAt()))
                .orElseThrow(() -> new InvalidReauthException());
    }

    static class InvalidReauthException extends BadCredentialsException {
        InvalidReauthException() {
            super("재인증 비밀번호가 올바르지 않습니다.");
        }
    }
}
