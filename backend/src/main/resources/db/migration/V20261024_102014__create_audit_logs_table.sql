-- create_audit_logs_table
-- 생성: 2026-10-24 10:20:14 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P3 investigation · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)
-- 다른 모듈의 기록은 이벤트로 받아 저장한다. 수정 · 삭제하지 않는다

-- 감사 로그 (누가 · 언제 · 무엇을 · 어디서)
CREATE TABLE audit_logs
(
    audit_id    BIGINT       NOT NULL AUTO_INCREMENT,
    actor_type  VARCHAR(20)  NOT NULL,                        -- STAFF / SYSTEM / AI
    actor_id    BIGINT       NULL,                            -- STAFF면 P1 논리 참조 (FK 없음)
    action      VARCHAR(60)  NOT NULL,                        -- 예: LOGIN_SUCCESS / DECISION_ACCEPT / RULE_DISABLE_REQUESTED
    target_type VARCHAR(40)  NULL,
    target_id   BIGINT       NULL,
    detail      JSON         NULL,
    client_ip   VARCHAR(45)  NULL,
    occurred_at DATETIME(6)  NOT NULL,                        -- UTC
    PRIMARY KEY (audit_id)
);

CREATE INDEX idx_audit_logs_occurred ON audit_logs (occurred_at);
CREATE INDEX idx_audit_logs_actor_occurred ON audit_logs (actor_id, occurred_at);
CREATE INDEX idx_audit_logs_target ON audit_logs (target_type, target_id);
