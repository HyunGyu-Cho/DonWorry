package com.donworry.fds.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 차단 목록 (blocklist_entries) — 등록 · 평가 전 확인 (#100 F-10). 해제는 관리자 승인 뒤(2-7)
@Entity
@Table(name = "blocklist_entries")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BlocklistEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "entry_id")
    private Long entryId;

    @Column(name = "entry_type", nullable = false, length = 20)
    private String entryType;

    // CARD는 카드번호 해시 — 화면에는 그대로 보내지 않는다
    @Column(name = "entry_value", nullable = false, length = 254)
    private String entryValue;

    // 화면에 보일 값 (#100) — 카드는 끝자리(**** 1173)
    @Column(name = "display_value", length = 254)
    private String displayValue;

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

    // STAFF(직원이 직접 등록) · CASE(사건 판정) — 해제 · 만료가 없는 영구 항목으로 시작
    public static BlocklistEntry create(
            String entryType,
            String entryValue,
            String displayValue,
            String reason,
            String source,
            Long sourceRef,
            Long createdBy,
            Instant now) {
        BlocklistEntry entry = new BlocklistEntry();
        entry.entryType = entryType;
        entry.entryValue = entryValue;
        entry.displayValue = displayValue;
        entry.reason = reason;
        entry.source = source;
        entry.sourceRef = sourceRef;
        entry.createdBy = createdBy;
        entry.createdAt = now.truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        return entry;
    }

    public boolean isActive(Instant now) {
        return releasedAt == null && (expiresAt == null || expiresAt.isAfter(now));
    }
}
