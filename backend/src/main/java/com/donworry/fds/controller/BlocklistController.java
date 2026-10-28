package com.donworry.fds.controller;

import com.donworry.fds.dto.BlocklistEntryResponse;
import com.donworry.fds.service.BlocklistQueryService;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// 차단 목록 (#82: 목록만) — 경보 상세가 "이미 차단한 값인지" 볼 때 부른다. 등록은 결제 경보, 해제는 관리자 승인 (#104)
@RestController
@RequestMapping("/api/fds/blocklist")
@RequiredArgsConstructor
public class BlocklistController {

    private final BlocklistQueryService blocklistQueryService;

    @GetMapping
    public List<BlocklistEntryResponse> list(@RequestParam(defaultValue = "true") boolean active) {
        return blocklistQueryService.list(active, Instant.now());
    }
}
