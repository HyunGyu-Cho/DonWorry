-- allow_staff_subject_on_security_cases
-- 생성: 2026-10-24 10:20:02 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P3 investigation · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)
-- 직원 계정 사건(STAFF_TAKEOVER · STAFF_SPRAY)은 가맹점 · 고객이 없어 두 컬럼을 NULL 허용으로 바꾼다
-- 결제 사건(PAYMENT_FRAUD)은 여전히 두 값을 채운다 (서비스에서 검사)
ALTER TABLE security_cases
    MODIFY COLUMN merchant_id  BIGINT       NULL,                         -- P1 merchants 논리 참조 (FK 없음)
    MODIFY COLUMN customer_ref VARCHAR(100) NULL,
    ADD COLUMN subject_user_id BIGINT       NULL AFTER customer_ref;      -- 대상 직원, P1 platform_users 논리 참조 (FK 없음)

-- 직원별 사건 목록
CREATE INDEX idx_security_cases_subject_created ON security_cases (subject_user_id, created_at);
