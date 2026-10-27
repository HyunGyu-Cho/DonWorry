package com.donworry.fds.service;

import com.donworry.fds.dto.BlocklistEntryResponse;
import com.donworry.fds.entity.BlocklistEntry;
import com.donworry.fds.repository.BlocklistEntryRepository;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 차단 목록 조회 (#82) — 등록 · 해제 · 평가 전 확인은 2-6
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BlocklistQueryService {

    private final BlocklistEntryRepository blocklistEntryRepository;

    public List<BlocklistEntryResponse> list(boolean activeOnly, Instant now) {
        return blocklistEntryRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(entry -> !activeOnly || isActive(entry, now))
                .map(BlocklistQueryService::response)
                .toList();
    }

    private static boolean isActive(BlocklistEntry entry, Instant now) {
        return entry.getReleasedAt() == null
                && (entry.getExpiresAt() == null || entry.getExpiresAt().isAfter(now));
    }

    // 카드는 해시 대신 가린 값 (차단 적중 수는 2-6)
    private static BlocklistEntryResponse response(BlocklistEntry entry) {
        String value = "CARD".equals(entry.getEntryType()) ? "**** (카드)" : entry.getEntryValue();
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
                0,
                null);
    }
}
