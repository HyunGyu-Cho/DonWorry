-- create_demo_fake_ips_table
-- 생성: 2026-10-24 10:20:07 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P1 identity · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)
-- 시연용: demo 프로필에서만 X-Demo-Client-IP 헤더 값을 이 목록으로 판정한다. 운영 경로에서는 읽지 않는다

-- 시연용 가짜 IP와 위치
CREATE TABLE demo_fake_ips
(
    demo_ip_id   BIGINT       NOT NULL AUTO_INCREMENT,
    ip_address   VARCHAR(45)  NOT NULL,
    country_code CHAR(2)      NOT NULL,                       -- ISO 국가 코드
    ip_type      VARCHAR(20)  NOT NULL,                       -- OFFICE / DOMESTIC / FOREIGN / ANONYMOUS
    label        VARCHAR(100) NOT NULL,                       -- 화면 표시용 설명
    PRIMARY KEY (demo_ip_id),
    CONSTRAINT uk_demo_fake_ips_ip_address UNIQUE (ip_address)
);
