-- seed_demo_customer_payments
-- 생성: 2026-10-27 09:40:18 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다


-- 시연 고객 김민수의 지난 결제 5건 (#82) — "평소 4만 원 · 자주 쓰는 카드" 이력
-- 이 이력이 있어야 평소보다 큰 금액(AMOUNT_SPIKE) · 처음 쓰는 카드(NEW_CARD)를 계산할 수 있다
INSERT INTO payments
    (merchant_id, customer_ref, buyer_name, buyer_email, card_fingerprint, card_last4, card_country,
     customer_joined_at, order_ref, order_title, amount, status, authorization_ref, created_at)
SELECT m.merchant_id, 'cakeshop-member-1024', '김민수', 'minsu@example.com', 'demo-fp-usual', '4821', 'KR',
       '2025-03-02 01:00:00.000000', p.order_ref, p.order_title, p.amount, 'CAPTURED', p.auth_ref,
       UTC_TIMESTAMP(6) - INTERVAL p.days_ago DAY
FROM merchants m
JOIN (SELECT 'DEMO-PAST-1' AS order_ref, '딸기 생크림 케이크' AS order_title, 38000 AS amount, 'DEMO-PAST-AUTH-1' AS auth_ref, 85 AS days_ago
      UNION ALL SELECT 'DEMO-PAST-2', '초코 케이크', 42000, 'DEMO-PAST-AUTH-2', 64
      UNION ALL SELECT 'DEMO-PAST-3', '치즈 케이크', 39000, 'DEMO-PAST-AUTH-3', 41
      UNION ALL SELECT 'DEMO-PAST-4', '딸기 생크림 케이크', 38000, 'DEMO-PAST-AUTH-4', 22
      UNION ALL SELECT 'DEMO-PAST-5', '고구마 케이크', 43000, 'DEMO-PAST-AUTH-5', 9) p
WHERE m.merchant_code = 'DEMOSHOP';
