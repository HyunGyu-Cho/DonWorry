-- create_staff_login_events_table
-- 생성: 2026-10-24 10:20:03 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P1 identity · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)

-- 직원 로그인 시도 1건마다 한 행 (성공 · 실패 모두). 직원 Rule 1 · 2 · 6 · 7의 입력
CREATE TABLE staff_login_events
(
    login_event_id     BIGINT       NOT NULL AUTO_INCREMENT,
    user_id            BIGINT       NULL,                     -- 없는 아이디로 시도하면 NULL
    login_id_attempted VARCHAR(100) NOT NULL,                 -- 입력한 아이디 (정규화 후)
    client_ip          VARCHAR(45)  NOT NULL,
    device_id          VARCHAR(100) NULL,
    user_agent         VARCHAR(300) NULL,
    result             VARCHAR(30)  NOT NULL,                 -- SUCCESS / BAD_PASSWORD / BAD_OTP / LOCKED / UNKNOWN_USER
    occurred_at        DATETIME(6)  NOT NULL,                 -- UTC
    PRIMARY KEY (login_event_id),
    CONSTRAINT fk_staff_login_events_user FOREIGN KEY (user_id) REFERENCES platform_users (user_id)
);

-- 분산 로그인 실패: 한 계정에 들어온 IP 수
CREATE INDEX idx_staff_login_events_login_id_occurred ON staff_login_events (login_id_attempted, occurred_at);
-- 비밀번호 뿌리기: 한 IP가 시도한 계정 수
CREATE INDEX idx_staff_login_events_ip_occurred ON staff_login_events (client_ip, occurred_at);
