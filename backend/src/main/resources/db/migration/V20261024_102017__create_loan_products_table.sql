-- create_loan_products_table
-- 생성: 2026-10-24 10:20:17 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P6 settlement · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)
-- Mock 은행 상품 조회만 한다 (신청 · 심사 없음). 14일 자금 예측은 저장하지 않고 정산 예정금으로 계산한다

-- 연계 대출 상품
CREATE TABLE loan_products
(
    loan_product_id  BIGINT        NOT NULL AUTO_INCREMENT,
    bank_name        VARCHAR(100)  NOT NULL,
    product_name     VARCHAR(200)  NOT NULL,
    max_limit_amount BIGINT        NOT NULL,                  -- KRW 정수
    min_rate         DECIMAL(9, 6) NOT NULL,                  -- 연 이율, 비율 0~1
    max_rate         DECIMAL(9, 6) NOT NULL,
    min_term_months  INT           NOT NULL,
    max_term_months  INT           NOT NULL,
    feature          VARCHAR(300)  NOT NULL,
    recommended      BOOLEAN       NOT NULL DEFAULT FALSE,
    status           VARCHAR(20)   NOT NULL,                  -- ACTIVE / INACTIVE
    PRIMARY KEY (loan_product_id)
);
