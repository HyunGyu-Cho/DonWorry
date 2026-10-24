-- create_approval_requests_table
-- 생성: 2026-10-24 10:20:13 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P3 investigation · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)

-- 2인 승인 요청 (AI 권고 반대 판정 · Rule 끄기 · 기준 완화 · 차단 해제)
CREATE TABLE approval_requests
(
    approval_id      BIGINT       NOT NULL AUTO_INCREMENT,
    request_type     VARCHAR(40)  NOT NULL,                   -- DECISION_OVERRIDE / RULE_DISABLE / RULE_THRESHOLD / BLOCKLIST_RELEASE
    target_type      VARCHAR(40)  NOT NULL,                   -- PAYMENT_DECISION / FDS_RULE / BLOCKLIST_ENTRY
    target_id        BIGINT       NOT NULL,                   -- 대상 ID (담당 모듈 논리 참조)
    payload          JSON         NULL,                       -- 승인되면 적용할 내용
    reason           VARCHAR(500) NOT NULL,
    requested_by     BIGINT       NOT NULL,                   -- P1 논리 참조 (FK 없음)
    requested_at     DATETIME(6)  NOT NULL,                   -- UTC
    status           VARCHAR(20)  NOT NULL,                   -- PENDING / APPROVED / REJECTED / EXPIRED
    decided_by       BIGINT       NULL,
    decided_at       DATETIME(6)  NULL,
    decision_comment VARCHAR(500) NULL,
    expires_at       DATETIME(6)  NOT NULL,
    PRIMARY KEY (approval_id),
    -- 요청자 본인 승인 금지 (서비스 검사와 별개로 DB도 막는다)
    CONSTRAINT ck_approval_requests_maker_checker CHECK (decided_by IS NULL OR decided_by <> requested_by)
);

-- 승인함: 상태별 최근 요청
CREATE INDEX idx_approval_requests_status_requested ON approval_requests (status, requested_at);
