-- add_otp_and_lock_fields_to_platform_users
-- 생성: 2026-10-24 10:20:01 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P1 identity · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)
-- 2단계 인증(TOTP)과 로그인 실패 잠금. role 값에 SECURITY_MANAGER(보안 관리자)가 추가된다 (컬럼 변경 없음)
ALTER TABLE platform_users
    ADD COLUMN otp_secret_encrypted VARCHAR(255) NULL AFTER password_hash,         -- 암호화한 TOTP 키, 미등록이면 NULL
    ADD COLUMN otp_enabled          BOOLEAN      NOT NULL DEFAULT FALSE AFTER otp_secret_encrypted,
    ADD COLUMN failed_login_count   INT          NOT NULL DEFAULT 0 AFTER otp_enabled, -- 성공하면 0으로
    ADD COLUMN locked_until         DATETIME(6)  NULL AFTER failed_login_count;        -- UTC, 잠금이 없으면 NULL
