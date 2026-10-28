package com.donworry.fds.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.donworry.FdsRuleFixture;
import com.donworry.MariaDbTestContainerConfig;
import com.donworry.identity.api.CurrentUser;
import java.util.Optional;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

// Rule 다시 켜기 (#104 2-7) — 시연 직원 jiwon(4, 보안 직원) · yunseo(5, 보안 관리자)
@Tag("mariadb")
@SpringBootTest
@AutoConfigureMockMvc
@Import(MariaDbTestContainerConfig.class)
class FdsRuleEnableTests {

    static final CurrentUser.UserView JIWON = new CurrentUser.UserView(4L, "SECURITY_STAFF", null);
    static final CurrentUser.UserView YUNSEO = new CurrentUser.UserView(5L, "SECURITY_MANAGER", null);
    static final CurrentUser.UserView OPERATOR = new CurrentUser.UserView(9L, "OPERATOR", null);

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    @MockitoBean
    CurrentUser currentUser;

    @Test
    void Rule다시켜기_보안직원관리자만_이미켜짐FDS_011_폐지R07은안됨() throws Exception {
        long first = FdsRuleFixture.create(jdbc, false);
        long second = FdsRuleFixture.create(jdbc, false);
        long retired = FdsRuleFixture.create(jdbc, false);
        FdsRuleFixture.retire(jdbc, retired);
        try {
            // 로그인 안 함 · 보안 직원이 아닌 계정은 켤 수 없다
            when(currentUser.get()).thenReturn(Optional.empty());
            enable(first)
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("FDS_013"));
            as(OPERATOR);
            enable(first)
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FDS_010"));

            // 보안 직원은 승인 없이 바로 켠다 → 켠 사람이 남는다
            as(JIWON);
            enable(first)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.enabled").value(true))
                    .andExpect(jsonPath("$.updatedBy").value(4));
            enable(first)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("FDS_011"));

            // 관리자도 켤 수 있다
            as(YUNSEO);
            enable(second)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.updatedBy").value(5));

            // 폐지한 Rule은 없는 Rule, 차단 목록(R07) · 직원 Rule은 켜고 끄는 대상이 아니다
            enable(retired)
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("FDS_012"));
            enable(FdsRuleFixture.idOf(jdbc, "BLOCKLIST"))
                    .andExpect(jsonPath("$.code").value("FDS_010"));
            enable(FdsRuleFixture.idOf(jdbc, "STAFF_NEW_DEVICE"))
                    .andExpect(jsonPath("$.code").value("FDS_010"));
        } finally {
            FdsRuleFixture.retire(jdbc, first, second);
        }
    }

    private void as(CurrentUser.UserView user) {
        when(currentUser.get()).thenReturn(Optional.of(user));
    }

    private ResultActions enable(long ruleId) throws Exception {
        return mvc.perform(post("/api/fds/rules/{ruleId}/enable", ruleId));
    }
}
