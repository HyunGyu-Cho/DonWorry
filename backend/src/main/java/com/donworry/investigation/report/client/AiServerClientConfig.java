package com.donworry.investigation.report.client;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

// donworry.report.writer=ai-server일 때만 ai-server 호출 도구를 만든다 (기본은 템플릿 작성기)
// 서비스 키는 환경 변수 DONWORRY_AI_SERVER_SERVICE_KEY로만 넣는다 — 저장소에 올리지 않는다
@Configuration
@ConditionalOnProperty(prefix = "donworry.report", name = "writer", havingValue = "ai-server")
class AiServerClientConfig {

    @Bean
    AiServerClient aiServerClient(
            @Value("${donworry.ai-server.base-url}") String baseUrl,
            @Value("${donworry.ai-server.service-key}") String serviceKey,
            @Value("${donworry.ai-server.connect-timeout-ms:2000}") long connectTimeoutMs,
            @Value("${donworry.ai-server.read-timeout-ms:5000}") long readTimeoutMs) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(connectTimeoutMs));
        requestFactory.setReadTimeout(Duration.ofMillis(readTimeoutMs));
        RestClient restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .build();
        return new AiServerClient(restClient, serviceKey);
    }
}
