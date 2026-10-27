-- add_decline_code_to_payments
-- 생성: 2026-10-27 22:56:11 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다


-- P5 payment · 개인 저장소 Issue #98 (F-7, ADR-0023)
-- 카드사 거절 사유 — LIMIT_EXCEEDED(한도 초과) · LOST_OR_STOLEN(분실 · 도난) · INVALID_CARD(잘못된 카드)
-- 거절(DECLINED) 결제만 채운다. R08 거절 후 재시도 · R06 카드 테스팅이 거절된 시도를 센다
ALTER TABLE payments
    ADD COLUMN decline_code VARCHAR(40) NULL AFTER authorization_ref;

CREATE INDEX idx_payments_card_created ON payments (card_fingerprint, created_at);
