package com.donworry;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * DonWorry 백엔드 진입점.
 *
 * <p>이 패키지의 직접 하위 패키지가 Spring Modulith 업무 모듈로 인식된다:
 * identity / payment / fds / investigation / settlement.
 */
@SpringBootApplication
public class DonWorryApplication {

    public static void main(String[] args) {
        SpringApplication.run(DonWorryApplication.class, args);
    }
}
