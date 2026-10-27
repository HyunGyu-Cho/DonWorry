package com.donworry.fds.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 차단 목록 (blocklist_entries) — 지금은 읽기만 (#82). 등록 · 해제 · 평가 전 확인은 2-6
@Entity
@Table(name = "blocklist_entries")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BlocklistEntry {

    @Id
    @Column(name = "entry_id")
    private Long entryId;

    @Column(name = "entry_type", nullable = false, length = 20)
    private String entryType;

    // CARD는 카드번호 해시 — 화면에는 그대로 보내지 않는다
    @Column(name = "entry_value", nullable = false, length = 254)
    private String entryValue;

    @Column(name = "reason", nullable = false, length = 500)
    private String reason;

    @Column(name = "source", nullable = false, length = 20)
    private String source;

    @Column(name = "source_ref")
    private Long sourceRef;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "created_at", nullable = false, columnDefinition = "DATETIME(6)")
    private Instant createdAt;

    @Column(name = "expires_at", columnDefinition = "DATETIME(6)")
    private Instant expiresAt;

    @Column(name = "released_at", columnDefinition = "DATETIME(6)")
    private Instant releasedAt;

    @Column(name = "released_by")
    private Long releasedBy;
}
