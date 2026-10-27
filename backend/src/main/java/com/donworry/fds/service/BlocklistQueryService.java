package com.donworry.fds.service;

import com.donworry.fds.dto.BlocklistEntryResponse;
import com.donworry.fds.entity.BlocklistEntry;
import com.donworry.fds.repository.BlocklistEntryRepository;
import com.donworry.fds.repository.FdsEvaluationRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 차단 목록 조회 (#82) — 항목별 최근 7일 막은 결제 수 · 마지막 차단 시각 (#100). 해제는 2-7
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BlocklistQueryService {

    private final BlocklistEntryRepository blocklistEntryRepository;
    private final FdsEvaluationRepository evaluationRepository;

    record Hits(int recent, Instant lastAt) {}

    public List<BlocklistEntryResponse> list(boolean activeOnly, Instant now) {
        Map<Long, Hits> hits = new HashMap<>();
        for (Object[] row : evaluationRepository.findBlocklistHits(now.minus(Duration.ofDays(7)))) {
            if (row[0] != null) {
                hits.put(((Number) row[0]).longValue(), new Hits(((Number) row[1]).intValue(), instant(row[2])));
            }
        }
        return blocklistEntryRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(entry -> !activeOnly || isActive(entry, now))
                .map(entry -> response(entry, hits.getOrDefault(entry.getEntryId(), new Hits(0, null))))
                .toList();
    }

    private static boolean isActive(BlocklistEntry entry, Instant now) {
        return entry.getReleasedAt() == null
                && (entry.getExpiresAt() == null || entry.getExpiresAt().isAfter(now));
    }

    // 네이티브 쿼리 시각은 드라이버에 따라 Timestamp · LocalDateTime · Instant로 온다 (DB는 UTC)
    private static Instant instant(Object value) {
        return switch (value) {
            case null -> null;
            case Instant instant -> instant;
            case java.sql.Timestamp timestamp -> timestamp.toInstant();
            case java.time.LocalDateTime local -> local.toInstant(java.time.ZoneOffset.UTC);
            default -> throw new IllegalStateException("unexpected time " + value.getClass());
        };
    }

    // 카드는 지문 대신 화면용 값(**** 1173), 없으면 가린 값
    private static BlocklistEntryResponse response(BlocklistEntry entry, Hits hits) {
        String value = entry.getDisplayValue() != null
                ? entry.getDisplayValue()
                : "CARD".equals(entry.getEntryType()) ? "**** (카드)" : entry.getEntryValue();
        return new BlocklistEntryResponse(
                entry.getEntryId(),
                entry.getEntryType(),
                value,
                entry.getReason(),
                entry.getSource(),
                entry.getSourceRef(),
                entry.getCreatedBy(),
                entry.getCreatedAt(),
                entry.getExpiresAt(),
                entry.getReleasedAt(),
                entry.getReleasedBy(),
                hits.recent(),
                hits.lastAt());
    }
}
