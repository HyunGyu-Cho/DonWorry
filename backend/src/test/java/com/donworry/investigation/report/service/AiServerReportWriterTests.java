package com.donworry.investigation.report.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.donworry.investigation.report.client.AiServerClient;
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.ResponseActions;
import org.springframework.web.client.RestClient;

// Spring → ai-server 조사 접수 — 가짜 ai-server(MockRestServiceServer)로 접수 · 다시 시도 · 실패를 확인한다
// DB 대신 ReportTransitions를 흉내 내고, 시도 사이 쉬는 시간은 기록만 한다
class AiServerReportWriterTests {

    static final String KEY = "test-service-key";
    static final ReportTarget TARGET = new ReportTarget(7L, 201L, "PAYMENT_FRAUD", 1, 2);

    MockRestServiceServer aiServer;
    ReportTransitions reportTransitions;
    AttemptRegistry attemptRegistry;
    List<Duration> pauses;
    List<String> sentBodies;
    AiServerReportWriter writer;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://ai-server");
        aiServer = MockRestServiceServer.bindTo(builder).build();
        reportTransitions = mock(ReportTransitions.class);
        when(reportTransitions.running(anyLong())).thenReturn(true);
        attemptRegistry = new AttemptRegistry();
        pauses = new ArrayList<>();
        sentBodies = new ArrayList<>();
        writer = new AiServerReportWriter(
                new AiServerClient(builder.build(), KEY), reportTransitions, attemptRegistry, pauses::add);
    }

    // 조사 요청 한 번을 기대하고, 보낸 본문을 기록해 둔다
    private ResponseActions expectRequest() {
        return aiServer.expect(requestTo("http://ai-server/investigations"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(AiServerClient.SERVICE_KEY_HEADER, KEY))
                .andExpect(request -> sentBodies.add(((MockClientHttpRequest) request).getBodyAsString()));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> savedError() {
        ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
        verify(reportTransitions).fail(eq(7L), body.capture(), any());
        return (Map<String, Object>) body.getValue().get("error");
    }

    // ai-server가 202로 접수하면 보고서를 "생성 중"으로 바꾸고 끝 — 요청에는 서비스 키와 조사에 필요한 값이 실린다
    @Test
    void write_accepted_marksRunning() {
        expectRequest()
                .andExpect(jsonPath("$.reportId").value(7))
                .andExpect(jsonPath("$.caseId").value(201))
                .andExpect(jsonPath("$.caseType").value("PAYMENT_FRAUD"))
                .andExpect(jsonPath("$.evidenceVersion").value(2))
                .andExpect(jsonPath("$.attemptId").isNotEmpty())
                .andRespond(withStatus(HttpStatus.ACCEPTED));

        writer.write(TARGET);

        aiServer.verify();
        verify(reportTransitions).running(7L);
        verify(reportTransitions, never()).fail(anyLong(), any(), any());
        assertThat(pauses).isEmpty();
    }

    // 접수된 시도 번호가 "현재 시도"로 남는다 — 결과 수신(2-17)이 이 번호의 결과만 반영한다
    @Test
    void write_accepted_remembersCurrentAttempt() {
        expectRequest().andRespond(withStatus(HttpStatus.ACCEPTED));

        writer.write(TARGET);

        UUID sent = UUID.fromString(sentBodies.getFirst().replaceAll(".*\"attemptId\":\"([^\"]+)\".*", "$1"));
        assertThat(attemptRegistry.isCurrent(7L, sent)).isTrue();
    }

    // ai-server 오류(5xx) 뒤 1초 쉬고 다시 요청 — 두 번째에 접수되면 "생성 중", 시도 번호는 매번 새로
    @Test
    void write_serverErrorThenAccepted_retriesWithNewAttemptId() {
        expectRequest().andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        expectRequest().andRespond(withStatus(HttpStatus.ACCEPTED));

        writer.write(TARGET);

        aiServer.verify();
        verify(reportTransitions).running(7L);
        assertThat(pauses).containsExactly(Duration.ofSeconds(1));
        assertThat(sentBodies).hasSize(2);
        assertThat(sentBodies.get(0)).isNotEqualTo(sentBodies.get(1));
    }

    // 연결 실패 · 오류 · 시간 초과가 이어지면 첫 시도 포함 총 3번 뒤 "실패" — 쉬는 시간은 1초 · 2초
    @Test
    void write_failsThreeTimes_marksFailedWithAttempts() {
        expectRequest().andRespond(withException(new IOException("연결 거부")));
        expectRequest().andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));
        expectRequest().andRespond(withException(new java.net.SocketTimeoutException("응답 시간 초과")));

        writer.write(TARGET);

        aiServer.verify();
        verify(reportTransitions, never()).running(anyLong());
        assertThat(pauses).containsExactly(Duration.ofSeconds(1), Duration.ofSeconds(2));
        Map<String, Object> error = savedError();
        assertThat(error).containsEntry("code", "AI_SERVER_UNREACHABLE").containsEntry("attempts", 3);
        assertThat(error.get("lastAttemptAt")).isNotNull();
    }

    // ai-server가 거절(401 서비스 키 틀림)하면 몇 번 보내도 같으므로 다시 요청하지 않고 바로 "실패"
    @Test
    void write_unauthorized_failsWithoutRetry() {
        expectRequest().andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        writer.write(TARGET);

        aiServer.verify();
        assertThat(pauses).isEmpty();
        assertThat(savedError()).containsEntry("code", "AI_SERVER_REJECTED").containsEntry("attempts", 1);
    }

    // 요청 형식 오류(422)도 다시 요청하지 않는다
    @Test
    void write_unprocessable_failsWithoutRetry() {
        expectRequest().andRespond(withStatus(HttpStatus.UNPROCESSABLE_CONTENT));

        writer.write(TARGET);

        aiServer.verify();
        assertThat(savedError()).containsEntry("code", "AI_SERVER_REJECTED");
    }

    // 결과가 접수 응답보다 먼저 와서 이미 끝났으면 "생성 중" 변경은 0건 — 실패로 바꾸지도 않는다
    @Test
    void write_acceptedButAlreadyFinished_leavesReportAlone() {
        when(reportTransitions.running(7L)).thenReturn(false);
        expectRequest().andRespond(withStatus(HttpStatus.ACCEPTED));

        writer.write(TARGET);

        verify(reportTransitions).running(7L);
        verify(reportTransitions, never()).fail(anyLong(), any(), any());
    }
}
