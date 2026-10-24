-- seed_loan_products
-- 생성: 2026-10-24 10:20:19 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P6 settlement · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)
-- 은행 이름은 모두 가상이다 (Mock 은행)

INSERT INTO loan_products
    (bank_name, product_name, max_limit_amount, min_rate, max_rate, min_term_months, max_term_months, feature, recommended, status)
VALUES
    ('한빛은행 (가상)', '정산 연계 운전자금 대출', 30000000, 0.054000, 0.079000, 6, 12,
     '돈워리 정산 예정 금액을 근거로 한도를 산정합니다.', TRUE, 'ACTIVE'),
    ('누리은행 (가상)', '가맹점 마이너스 통장', 20000000, 0.061000, 0.088000, 12, 12,
     '한도 안에서 쓴 만큼만 이자를 냅니다. (연장 가능)', FALSE, 'ACTIVE'),
    ('새솔저축은행 (가상)', '소상공인 매출 기반 단기자금', 10000000, 0.089000, 0.125000, 3, 6,
     '최근 3개월 카드 매출 기준 · 빠른 심사', FALSE, 'ACTIVE');
