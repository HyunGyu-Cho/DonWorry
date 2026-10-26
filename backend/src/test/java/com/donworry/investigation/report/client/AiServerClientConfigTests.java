package com.donworry.investigation.report.client;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

// 기본(템플릿 작성기)에서는 ai-server 호출 도구를 만들지 않고, writer=ai-server일 때만 만든다
class AiServerClientConfigTests {

    final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(AiServerClientConfig.class)
            .withPropertyValues(
                    "donworry.ai-server.base-url=http://localhost:8000", "donworry.ai-server.service-key=k");

    // 설정이 없으면(기본 fake) 호출 도구가 없다 — ai-server를 켜지 않은 PC에서도 사건 흐름이 돈다
    @Test
    void aiServerClient_defaultWriter_notCreated() {
        runner.run(context -> assertThat(context).doesNotHaveBean(AiServerClient.class));
    }

    // writer=ai-server면 호출 도구가 만들어진다
    @Test
    void aiServerClient_aiServerWriter_created() {
        runner.withPropertyValues("donworry.report.writer=ai-server")
                .run(context -> assertThat(context).hasSingleBean(AiServerClient.class));
    }
}
