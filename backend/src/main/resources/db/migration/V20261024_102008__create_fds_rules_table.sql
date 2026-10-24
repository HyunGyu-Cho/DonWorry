-- create_fds_rules_table
-- 생성: 2026-10-24 10:20:08 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P2 fds · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)

-- Rule 카탈로그 (결제 Rule 8 · 직원 Rule 7). 끄기 · 기준 완화는 2인 승인 후에만 바뀐다
CREATE TABLE fds_rules
(
    rule_id      BIGINT       NOT NULL AUTO_INCREMENT,
    rule_code    VARCHAR(100) NOT NULL,                       -- fds_rule_hits · staff_rule_hits의 rule_code와 같은 값
    target       VARCHAR(20)  NOT NULL,                       -- PAYMENT / STAFF
    display_name VARCHAR(200) NOT NULL,
    criteria     VARCHAR(500) NOT NULL,                       -- 화면 설명용 기준 문장
    action       VARCHAR(20)  NOT NULL,                       -- SCORE(점수 더하기) / DENY(즉시 거절) / ALERT(직원 경보)
    score        INT          NOT NULL DEFAULT 0,             -- 결제 Rule 기본 점수, 직원 Rule은 0
    severity     VARCHAR(20)  NULL,                           -- 직원 Rule 위험도: CAUTION / HIGH
    threshold    JSON         NULL,                           -- 기준값, 예: 금액 구간별 점수
    enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
    updated_by   BIGINT       NULL,                           -- P1 platform_users 논리 참조 (FK 없음)
    created_at   DATETIME(6)  NOT NULL,                       -- UTC
    updated_at   DATETIME(6)  NOT NULL,
    PRIMARY KEY (rule_id),
    CONSTRAINT uk_fds_rules_rule_code UNIQUE (rule_code)
);
