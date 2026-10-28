package com.donworry.fds.controller;

import com.donworry.fds.dto.FdsRuleResponse;
import com.donworry.fds.service.FdsRuleCommandService;
import com.donworry.fds.service.FdsRuleQueryService;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// Rule 카탈로그 (#82) — 화면 홈 · 경보 · 사건이 Rule 이름을 여기서 읽는다. 다시 켜기 (#104 2-7)
@RestController
@RequestMapping("/api/fds/rules")
@RequiredArgsConstructor
public class FdsRuleController {

    private final FdsRuleQueryService ruleQueryService;
    private final FdsRuleCommandService ruleCommandService;

    @GetMapping
    public List<FdsRuleResponse.Rule> rules() {
        return ruleQueryService.rules();
    }

    @GetMapping("/hit-stats")
    public List<FdsRuleResponse.HitStat> hitStats(@RequestParam(defaultValue = "7") int days) {
        return ruleQueryService.hitStats(Math.min(Math.max(days, 1), 31), Instant.now());
    }

    // 꺼진 Rule 다시 켜기 (#104 2-7) — 보안 직원 · 관리자, 승인 없이 바로. 끄기는 관리자 승인 요청으로만
    @PostMapping("/{ruleId}/enable")
    public FdsRuleResponse.Rule enable(@PathVariable Long ruleId) {
        return ruleCommandService.enable(ruleId);
    }
}
