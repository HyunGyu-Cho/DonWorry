package com.donworry.investigation.report.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.donworry.MariaDbTestContainerConfig;
import com.donworry.investigation.report.entity.AiReport;
import com.donworry.investigation.report.repository.AiReportRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

// 화면이 읽는 보고서 조회 (2-17b) — 최신 완료 보고서 · 최신 조사 상태를 실제 MariaDB로 확인한다
// DB는 다른 테스트와 함께 쓰므로 Case 번호를 테스트마다 새로 뽑는다
@Tag("mariadb")
@SpringBootTest
@AutoConfigureMockMvc
@Import(MariaDbTestContainerConfig.class)
@Transactional
class ReportViewControllerTests {

    static final AtomicLong NEXT_CASE_ID = new AtomicLong(8_000_000L);
    static final Instant NOW = Instant.now().truncatedTo(ChronoUnit.MICROS);
    static final Map<String, Object> BODY = Map.of("schemaVersion", 2, "verdict", "본인 확인이 필요합니다");
    static final Map<String, Object> ERROR = Map.of("error", Map.of("code", "AI_RESULT_INVALID", "reason", "비밀"));

    @Autowired
    MockMvc mvc;

    @Autowired
    AiReportRepository aiReportRepository;

    long caseId;

    @BeforeEach
    void newCaseId() {
        caseId = NEXT_CASE_ID.incrementAndGet();
    }

    private Long pending(int reportVersion) {
        return aiReportRepository
                .save(AiReport.pending(caseId, reportVersion, reportVersion, NOW))
                .getId();
    }

    private String reportUrl() {
        return "/api/investigation/cases/" + caseId + "/report";
    }

    // 완료된 보고서가 있으면 그 본문을 그대로 돌려준다
    @Test
    void report_succeeded_returnsBody() throws Exception {
        aiReportRepository.markSucceeded(pending(1), BODY, NOW);

        mvc.perform(get(reportUrl()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schemaVersion").value(2))
                .andExpect(jsonPath("$.verdict").value("본인 확인이 필요합니다"));
    }

    // 최신 조사(v2)가 실패해도 이전 완료본(v1)을 보여 주고, 조사 상태는 v2 실패 — 실패 이유는 보내지 않는다
    @Test
    void latestFailed_reportShowsPreviousAndRunShowsFailure() throws Exception {
        aiReportRepository.markSucceeded(pending(1), BODY, NOW);
        aiReportRepository.markFailed(pending(2), ERROR, NOW);

        mvc.perform(get(reportUrl()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.verdict").value("본인 확인이 필요합니다"));
        mvc.perform(get(reportUrl() + "/run"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.caseId").value(String.valueOf(caseId)))
                .andExpect(jsonPath("$.reportVersion").value(2))
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.finishedAt").isNotEmpty())
                .andExpect(jsonPath("$.steps").isEmpty())
                .andExpect(jsonPath("$.error").doesNotExist());
    }

    // 생성 대기 · 생성 중이면 완료 보고서는 없고(404), 조사 상태는 조사 중
    @Test
    void notFinished_reportNotFoundAndRunRunning() throws Exception {
        pending(1);

        mvc.perform(get(reportUrl()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RPT_001"));
        mvc.perform(get(reportUrl() + "/run"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RUNNING"))
                .andExpect(jsonPath("$.finishedAt").isEmpty());
    }

    // 보고서가 하나도 없으면 둘 다 404 — 화면은 "보고서 없음"으로 보여 준다
    @Test
    void noReport_bothNotFound() throws Exception {
        mvc.perform(get(reportUrl()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RPT_001"));
        mvc.perform(get(reportUrl() + "/run")).andExpect(status().isNotFound());
    }
}
