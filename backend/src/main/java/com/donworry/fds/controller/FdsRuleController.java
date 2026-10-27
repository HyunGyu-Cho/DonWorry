package com.donworry.fds.controller;

import com.donworry.fds.dto.FdsRuleResponse;
import com.donworry.fds.service.FdsRuleQueryService;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// Rule 카탈로그 (#82) — 화면 홈 · 경보 · 사건이 Rule 이름을 여기서 읽는다
@RestController
@RequestMapping("/api/fds/rules")
@RequiredArgsConstructor
public class FdsRuleController {

    private final FdsRuleQueryService ruleQueryService;

    @GetMapping
    public List<FdsRuleResponse.Rule> rules() {
        return ruleQueryService.rules();
    }

    @GetMapping("/hit-stats")
    public List<FdsRuleResponse.HitStat> hitStats(@RequestParam(defaultValue = "7") int days) {
        return ruleQueryService.hitStats(Math.min(Math.max(days, 1), 31), Instant.now());
    }
}
