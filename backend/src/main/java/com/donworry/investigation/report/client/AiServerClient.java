package com.donworry.investigation.report.client;

import com.donworry.investigation.report.dto.InvestigationResultRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

// ai-server 조사 접수 · 결과 조회 호출 (ADR-0009 결정 1 · 2). 트랜잭션 밖에서만 부른다 (02-code 4절)
// 결과는 부른 쪽이 판단하도록 접수 · 다시 해 볼 실패 · 다시 해도 같은 실패로만 나눠 돌려준다
public class AiServerClient {

    public static final String SERVICE_KEY_HEADER = "X-Service-Key";

    private final RestClient restClient;
    private final String serviceKey;

    public AiServerClient(RestClient restClient, String serviceKey) {
        this.restClient = restClient;
        this.serviceKey = serviceKey;
    }

    public Outcome requestInvestigation(
            Long reportId, UUID attemptId, Long caseId, String caseType, int evidenceVersion, List<Long> paymentIds) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reportId", reportId);
        body.put("attemptId", attemptId.toString());
        body.put("caseId", caseId);
        body.put("caseType", caseType);
        body.put("evidenceVersion", evidenceVersion);
        // 사건에 묶인 결제 번호 — AI가 결제별 권고에 이 번호만 쓴다 (직원 사건은 빈 목록)
        body.put("paymentIds", paymentIds);
        try {
            HttpStatusCode status = restClient
                    .post()
                    .uri("/investigations")
                    .header(SERVICE_KEY_HEADER, serviceKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .exchange((request, response) -> response.getStatusCode());
            if (status.is2xxSuccessful()) {
                return Outcome.accepted();
            }
            // 5xx는 ai-server 쪽 일시 문제일 수 있어 다시 해 본다. 4xx(키 틀림 · 형식 오류)는 몇 번 보내도 같다
            return status.is5xxServerError()
                    ? Outcome.retryable("ai-server 오류 " + status.value())
                    : Outcome.rejected("ai-server가 거절 " + status.value());
        } catch (ResourceAccessException e) {
            // 연결 실패 · 응답 시간 초과
            return Outcome.retryable("ai-server 연결 실패 · 시간 초과");
        }
    }

    // 결과가 제때 오지 않을 때 직접 물어본다 (2-18). ai-server는 끝난 조사 결과를 잠시 들고 있다
    // 없음(404) · 연결 실패 · 형식 오류는 모두 빈 값 — 부른 쪽이 시간 초과 1회로 센다
    public Optional<InvestigationResultRequest> findResult(Long reportId, UUID attemptId) {
        try {
            InvestigationResultRequest result = restClient
                    .get()
                    .uri("/investigations/{reportId}?attemptId={attemptId}", reportId, attemptId)
                    .header(SERVICE_KEY_HEADER, serviceKey)
                    .exchange((request, response) -> response.getStatusCode().is2xxSuccessful()
                            ? response.bodyTo(InvestigationResultRequest.class)
                            : null);
            return Optional.ofNullable(result);
        } catch (RestClientException e) {
            return Optional.empty();
        }
    }

    public enum Kind {
        ACCEPTED,
        RETRYABLE,
        REJECTED
    }

    public record Outcome(Kind kind, String reason) {

        static Outcome accepted() {
            return new Outcome(Kind.ACCEPTED, null);
        }

        static Outcome retryable(String reason) {
            return new Outcome(Kind.RETRYABLE, reason);
        }

        static Outcome rejected(String reason) {
            return new Outcome(Kind.REJECTED, reason);
        }
    }
}
