package com.donworry.fds.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

// FDS Rule 카탈로그 (fds_rules 시드) — 평가가 기준값 · 점수를 여기서 읽는다 (#82). 켜기는 바로, 끄기는 관리자 승인 뒤 (#104 2-7)
@Entity
@Table(name = "fds_rules")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FdsRule {

    @Id
    @Column(name = "rule_id")
    private Long ruleId;

    @Column(name = "rule_code", nullable = false, length = 100)
    private String ruleCode;

    // 결제 Rule 표시 번호 R01~R08 (#96). 직원 Rule · 폐지 Rule은 null
    @Column(name = "display_code", length = 10)
    private String displayCode;

    // PAYMENT / STAFF
    @Column(name = "target", nullable = false, length = 20)
    private String target;

    @Column(name = "display_name", nullable = false, length = 200)
    private String displayName;

    // 화면 설명용 기준 문장
    @Column(name = "criteria", nullable = false, length = 500)
    private String criteria;

    // SCORE / DENY / ALERT
    @Column(name = "action", nullable = false, length = 20)
    private String action;

    @Column(name = "score", nullable = false)
    private int score;

    @Column(name = "severity", length = 20)
    private String severity;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "threshold")
    private Map<String, Object> threshold;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    // 폐지 시각 (#96) — 폐지 Rule은 평가 · 카탈로그에서 빠진다. enabled(직원이 끄고 켬)와 다르다
    @Column(name = "retired_at", columnDefinition = "DATETIME(6)")
    private Instant retiredAt;

    @Column(name = "updated_by")
    private Long updatedBy;

    @Column(name = "updated_at", nullable = false, columnDefinition = "DATETIME(6)")
    private Instant updatedAt;

    // 켜고 끌 수 있는 Rule — 폐지 안 된 결제 Rule만. 차단 목록(R07)은 재범 방지, 직원 Rule은 흔적 지우기 방지로 막는다 (화면 canToggle과 같은 규칙)
    public boolean isToggleable() {
        return retiredAt == null && "PAYMENT".equals(target) && !"BLOCKLIST".equals(ruleCode);
    }

    public void enable(Long userId, Instant now) {
        switchTo(true, userId, now);
    }

    public void disable(Long userId, Instant now) {
        switchTo(false, userId, now);
    }

    private void switchTo(boolean on, Long userId, Instant now) {
        enabled = on;
        updatedBy = userId;
        updatedAt = now.truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    }
}
