-- add_order_and_buyer_fields_to_payments
-- 생성: 2026-10-27 09:40:14 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다


-- 시연 뼈대 ① (#82): 결제창 · 사건 화면 · 메일에 보일 주문 이름 · 구매자 이름 · 픽업 예정
-- CakeShop 결제 준비 요청에서 받는 값 (docs/payment/cakeshop-contract.md 3절, buyer_name은 결제창 표시용으로 추가)
ALTER TABLE payments
    ADD COLUMN order_title VARCHAR(100) NULL AFTER order_ref,     -- 주문 이름, 예: 단체 행사용 케이크 세트
    ADD COLUMN buyer_name  VARCHAR(50)  NULL AFTER customer_ref,  -- 구매자 이름 (화면 표시용)
    ADD COLUMN pickup_at   DATETIME(6)  NULL AFTER order_title;   -- 픽업 예정 시각 (UTC)
