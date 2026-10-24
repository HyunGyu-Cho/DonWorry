-- add_card_and_buyer_fields_to_payments
-- 생성: 2026-10-24 10:20:00 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P5 payment · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)
-- 결제 FDS Rule 8개와 구매자 메일에 필요한 연동 필드. 기존 행 · CakeShop 연동 전 결제가 있어 모두 NULL 허용
-- 카드번호 원문은 저장하지 않는다 (card_fingerprint = 카드번호 해시, card_last4 = 화면 표시용)
ALTER TABLE payments
    ADD COLUMN buyer_email        VARCHAR(254) NULL AFTER customer_ref,  -- 구매자 메일 수신 주소
    ADD COLUMN client_ip          VARCHAR(45)  NULL AFTER buyer_email,   -- IPv6 길이까지
    ADD COLUMN device_id          VARCHAR(100) NULL AFTER client_ip,
    ADD COLUMN card_fingerprint   VARCHAR(64)  NULL AFTER device_id,     -- NEW_CARD · CARD_TESTING
    ADD COLUMN card_last4         CHAR(4)      NULL AFTER card_fingerprint,
    ADD COLUMN card_country       CHAR(2)      NULL AFTER card_last4,    -- ISO 국가 코드, GEO_MISMATCH
    ADD COLUMN customer_joined_at DATETIME(6)  NULL AFTER card_country;  -- CakeShop 가입 시각 (UTC), NEW_ACCOUNT

-- CARD_TESTING: 같은 IP에서 1시간 안 카드 수
CREATE INDEX idx_payments_client_ip_created ON payments (client_ip, created_at);
-- AMOUNT_SPIKE · DECLINE_RETRY: 고객별 최근 결제
CREATE INDEX idx_payments_customer_created ON payments (customer_ref, created_at);
