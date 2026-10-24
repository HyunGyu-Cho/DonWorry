-- create_case_actions_table
-- 생성: 2026-10-24 10:20:12 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P3 investigation · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)
-- 결제 판정의 금융 조치는 기존 action_handoffs가 맡는다. 이 테이블은 직원 사건 조치만 담는다

-- 직원 사건 조치 (세션 종료 · 계정 잠금 · OTP 재등록 · IP 차단 등)
CREATE TABLE case_actions
(
    case_action_id BIGINT       NOT NULL AUTO_INCREMENT,
    case_id        BIGINT       NOT NULL,
    action_type    VARCHAR(40)  NOT NULL,                     -- KILL_SESSIONS / LOCK_STAFF / RESET_MFA / BLOCK_IPS / FORCE_PW / WATCH / REJECT_PENDING / REVIEW_DECISIONS / CLEAR_FLAG
    target_ref     VARCHAR(200) NULL,                         -- 대상 설명, 예: 직원 ID · IP 묶음
    status         VARCHAR(20)  NOT NULL,                     -- REQUESTED / DONE / FAILED
    requested_by   BIGINT       NOT NULL,                     -- 보안 관리자, P1 논리 참조 (FK 없음)
    requested_at   DATETIME(6)  NOT NULL,                     -- UTC
    completed_at   DATETIME(6)  NULL,
    failure_reason VARCHAR(500) NULL,
    PRIMARY KEY (case_action_id),
    CONSTRAINT fk_case_actions_case FOREIGN KEY (case_id) REFERENCES security_cases (case_id)
);
