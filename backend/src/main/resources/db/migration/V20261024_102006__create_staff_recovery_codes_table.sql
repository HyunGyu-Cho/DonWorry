-- create_staff_recovery_codes_table
-- 생성: 2026-10-24 10:20:06 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P1 identity · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)

-- OTP 기기를 잃었을 때 쓰는 1회용 복구 코드 (해시만 저장)
CREATE TABLE staff_recovery_codes
(
    recovery_code_id BIGINT       NOT NULL AUTO_INCREMENT,
    user_id          BIGINT       NOT NULL,
    code_hash        VARCHAR(255) NOT NULL,                   -- BCrypt
    created_at       DATETIME(6)  NOT NULL,                   -- UTC
    used_at          DATETIME(6)  NULL,                       -- 쓰지 않았으면 NULL
    PRIMARY KEY (recovery_code_id),
    CONSTRAINT fk_staff_recovery_codes_user FOREIGN KEY (user_id) REFERENCES platform_users (user_id)
);
