package com.donworry.fds.dto;

import java.time.Instant;

// 화면 types/fds.ts BlocklistEntry와 같은 모양
public record BlocklistEntryResponse(
        Long entryId,
        String entryType,
        String entryValue,
        String reason,
        String source,
        Long sourceRef,
        Long createdBy,
        Instant createdAt,
        Instant expiresAt,
        Instant releasedAt,
        Long releasedBy,
        int hits7d,
        Instant lastHitAt) {}
