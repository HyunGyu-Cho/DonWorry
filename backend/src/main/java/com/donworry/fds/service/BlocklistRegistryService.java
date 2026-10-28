package com.donworry.fds.service;

import com.donworry.fds.api.BlocklistRegistry;
import com.donworry.fds.api.TargetChange;
import com.donworry.fds.entity.BlocklistEntry;
import com.donworry.fds.repository.BlocklistEntryRepository;
import java.time.Instant;
import java.util.Locale;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 차단 목록 등록 (#100 F-10) · 승인 뒤 해제 (#104 2-7) — 같은 활성 값은 한 줄만. 이메일은 소문자 · 앞뒤 공백 없이 저장해 대조한다
@Service
@RequiredArgsConstructor
public class BlocklistRegistryService implements BlocklistRegistry {

    static final Set<String> TYPES = Set.of("CARD", "DEVICE", "IP", "EMAIL");

    private final BlocklistEntryRepository repository;

    @Override
    @Transactional
    public Registered register(NewEntry entry) {
        if (entry == null || !TYPES.contains(entry.entryType())) {
            throw new IllegalArgumentException("entryType must be CARD, DEVICE, IP or EMAIL");
        }
        String value = normalize(entry.entryType(), entry.entryValue());
        if (value == null || value.isEmpty()) {
            throw new IllegalArgumentException("entryValue must not be blank");
        }
        Instant now = Instant.now();
        var existing = repository.findByEntryTypeAndEntryValue(entry.entryType(), value).stream()
                .filter(e -> e.isActive(now))
                .findFirst();
        if (existing.isPresent()) {
            return registered(existing.get(), false);
        }
        String display =
                entry.displayValue() != null ? entry.displayValue() : "CARD".equals(entry.entryType()) ? null : value;
        BlocklistEntry saved = repository.save(BlocklistEntry.create(
                entry.entryType(),
                value,
                display,
                entry.reason(),
                entry.source(),
                entry.sourceRef(),
                entry.createdBy(),
                now));
        return registered(saved, true);
    }

    @Override
    @Transactional(readOnly = true)
    public EntryState state(Long entryId) {
        Instant now = Instant.now();
        return repository
                .findById(entryId)
                .map(e -> e.isActive(now) ? EntryState.ACTIVE : EntryState.INACTIVE)
                .orElse(EntryState.MISSING);
    }

    // 해제하면 다음 결제 평가의 차단 대조(findActiveMatches)에서 빠진다 (#104 2-7)
    @Override
    @Transactional
    public TargetChange release(Long entryId, Long approvedBy) {
        Instant now = Instant.now();
        var found = repository.findByIdForUpdate(entryId);
        if (found.isEmpty()) {
            return TargetChange.UNAVAILABLE;
        }
        if (!found.get().isActive(now)) {
            return TargetChange.ALREADY_DONE;
        }
        found.get().release(approvedBy, now);
        return TargetChange.CHANGED;
    }

    // 대조 · 저장 전에 값을 같은 모양으로 — 이메일은 대소문자를 가리지 않는다
    static String normalize(String entryType, String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return "EMAIL".equals(entryType) ? trimmed.toLowerCase(Locale.ROOT) : trimmed;
    }

    private static Registered registered(BlocklistEntry entry, boolean created) {
        return new Registered(entry.getEntryId(), entry.getEntryType(), entry.getDisplayValue(), created);
    }
}
