-- create_staff_sessions_table
-- 생성: 2026-10-24 10:20:04 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P1 identity · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)

-- 직원 접속 세션 기록. 세션 강제 종료 · 세션 동시 사용 Rule의 입력
CREATE TABLE staff_sessions
(
    staff_session_id BIGINT       NOT NULL AUTO_INCREMENT,
    user_id          BIGINT       NOT NULL,
    session_ref      VARCHAR(100) NOT NULL,                   -- 서버 세션 ID의 해시 (원문 저장 금지)
    client_ip        VARCHAR(45)  NOT NULL,                   -- 로그인 시점 IP
    device_id        VARCHAR(100) NULL,
    started_at       DATETIME(6)  NOT NULL,                   -- UTC
    last_seen_at     DATETIME(6)  NOT NULL,
    ended_at         DATETIME(6)  NULL,                       -- 진행 중이면 NULL
    end_reason       VARCHAR(30)  NULL,                       -- LOGOUT / EXPIRED / FORCED
    PRIMARY KEY (staff_session_id),
    CONSTRAINT uk_staff_sessions_session_ref UNIQUE (session_ref),
    CONSTRAINT fk_staff_sessions_user FOREIGN KEY (user_id) REFERENCES platform_users (user_id)
);

-- 직원별 진행 중 세션
CREATE INDEX idx_staff_sessions_user_ended ON staff_sessions (user_id, ended_at);
