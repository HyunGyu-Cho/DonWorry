-- seed_demo_staff_users
-- 생성: 2026-10-24 10:20:21 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P1 identity · 기준: 최종 기획+설계서 5 직원 계정 보호 (개인 저장소 Issue #3)
-- 시연 직원 3명 (비밀번호는 기존 시연 계정과 같은 1234). OTP는 demo 프로필에서 고정 코드로 확인하므로 키는 비워 둔다
-- 박지원: 탈취 대상 보안 직원 · 최윤서: 직원 사건 판정 · 2인 승인 담당 보안 관리자 · 이도현: 분산 공격 두 번째 대상

INSERT INTO platform_users
    (login_id, password_hash, otp_secret_encrypted, otp_enabled, display_name, status, role, merchant_id, created_at)
VALUES
    ('jiwon', '$2a$10$gJU1ZSS8mHMm1lX1UK8peeJjvEFAlHj.8P.s.s/aHtnGuFYnxGU4u', NULL, TRUE,
     '박지원', 'ACTIVE', 'SECURITY_STAFF', NULL, UTC_TIMESTAMP(6)),
    ('yunseo', '$2a$10$gJU1ZSS8mHMm1lX1UK8peeJjvEFAlHj.8P.s.s/aHtnGuFYnxGU4u', NULL, TRUE,
     '최윤서', 'ACTIVE', 'SECURITY_MANAGER', NULL, UTC_TIMESTAMP(6)),
    ('dohyun', '$2a$10$gJU1ZSS8mHMm1lX1UK8peeJjvEFAlHj.8P.s.s/aHtnGuFYnxGU4u', NULL, TRUE,
     '이도현', 'ACTIVE', 'SECURITY_STAFF', NULL, UTC_TIMESTAMP(6));
