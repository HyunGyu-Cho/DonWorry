package com.donworry.investigation.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

// 결제 경보에서 차단 목록 등록 (#100 F-10) — 화면 types/fds.ts BlockFromAlert와 같은 모양
public final class BlocklistDtos {

    private BlocklistDtos() {}

    // types: CARD · DEVICE · IP · EMAIL 중 고른 값. 값 자체는 서버가 결제에서 찾는다 (카드 지문은 화면에 없음)
    public record BlockRequest(
            @NotEmpty List<String> types,
            @Size(min = 5, max = 500) String reason) {}

    // already=true면 이미 차단돼 있던 값. entryValue는 화면용 값 (카드는 **** 1173)
    public record BlockedEntry(Long entryId, String entryType, String entryValue, boolean already) {}
}
