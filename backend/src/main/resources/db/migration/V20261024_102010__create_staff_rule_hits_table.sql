-- create_staff_rule_hits_table
-- 생성: 2026-10-24 10:20:10 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P2 fds · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)

-- 직원 Rule 적중 1건마다 한 행 (직원 경보)
CREATE TABLE staff_rule_hits
(
    staff_hit_id   BIGINT       NOT NULL AUTO_INCREMENT,
    user_id        BIGINT       NULL,                         -- 대상 직원, P1 논리 참조 (FK 없음). 뿌리기처럼 여러 계정이면 NULL
    login_event_id BIGINT       NULL,                         -- 계기가 된 로그인, P1 논리 참조 (FK 없음)
    rule_code      VARCHAR(100) NOT NULL,                     -- 예: STAFF_LOGIN_FAIL
    severity       VARCHAR(20)  NOT NULL,                     -- CAUTION / HIGH
    summary        VARCHAR(300) NOT NULL,                     -- 화면 한 줄 설명
    observed_value JSON         NULL,                         -- 예: 실패 횟수 · IP 목록
    evidence_refs  JSON         NULL,                         -- 근거 로그인 기록 ID 등
    window_start   DATETIME(6)  NULL,                         -- 단건이면 NULL
    window_end     DATETIME(6)  NULL,
    detected_at    DATETIME(6)  NOT NULL,                     -- UTC
    PRIMARY KEY (staff_hit_id)
);

-- 직원별 · 최근 경보 목록
CREATE INDEX idx_staff_rule_hits_user_detected ON staff_rule_hits (user_id, detected_at);
CREATE INDEX idx_staff_rule_hits_detected ON staff_rule_hits (detected_at);
