-- ---------------------------------------------------------------------------
-- settlement 모듈 — 매입·정산·환불·자금관리(cashflow)
-- 정본: Notion 04-2 테이블 16~22 / 25, 04-3 DEC-08·DEC-09·DEC-11, TEST-04
--
-- payments 는 payment 모듈 소유이므로 payment_id 에 DB FK 를 두지 않는다 (04-1).
-- 금액은 KRW 원 단위. 수수료는 건별 원 단위 HALF_UP.
-- ---------------------------------------------------------------------------

-- 16. captures — 승인된 결제의 매입 기록 (DEC-09, 모의)
CREATE TABLE captures (
    capture_id  BIGINT         NOT NULL AUTO_INCREMENT,
    payment_id  BIGINT         NOT NULL,
    merchant_id BIGINT         NOT NULL,
    amount      DECIMAL(18, 2) NOT NULL,
    status      VARCHAR(20)    NOT NULL COMMENT 'CAPTURED / SETTLED 등',
    captured_at DATETIME(6)    NULL,
    created_at  DATETIME(6)    NOT NULL,
    PRIMARY KEY (capture_id),
    -- DEC-09: APPROVED 결제당 매입 1건
    UNIQUE KEY uk_captures_payment (payment_id),
    -- 전일 승인된 미정산 매입 배치 구성
    KEY ix_captures_merchant_status_time (merchant_id, status, created_at)
) ENGINE = InnoDB;

-- 17. settlements — 가맹점별 정산 배치 헤더 (DEC-09)
CREATE TABLE settlements (
    settlement_id    BIGINT         NOT NULL AUTO_INCREMENT,
    merchant_id      BIGINT         NOT NULL,
    period_start     DATE           NOT NULL,
    period_end       DATE           NOT NULL,
    gross_amount     DECIMAL(18, 2) NOT NULL,
    fee_amount       DECIMAL(18, 2) NOT NULL COMMENT '시연용 2.5% 고정',
    net_amount       DECIMAL(18, 2) NOT NULL COMMENT 'gross - fee - 환불 조정',
    status           VARCHAR(20)    NOT NULL COMMENT 'SCHEDULED / PAID / FAILED',
    expected_pay_date DATE          NOT NULL COMMENT '매입일 + 2영업일 (토·일 제외)',
    paid_at          DATETIME(6)    NULL,
    PRIMARY KEY (settlement_id),
    KEY ix_settlements_merchant_period (merchant_id, period_start),
    KEY ix_settlements_status_pay_date (status, expected_pay_date)
) ENGINE = InnoDB;

-- 18. settlement_items — 결제 매입 ↔ 정산 연결
CREATE TABLE settlement_items (
    item_id       BIGINT         NOT NULL AUTO_INCREMENT,
    settlement_id BIGINT         NOT NULL,
    capture_id    BIGINT         NOT NULL,
    gross_amount  DECIMAL(18, 2) NOT NULL,
    fee_amount    DECIMAL(18, 2) NOT NULL,
    net_amount    DECIMAL(18, 2) NOT NULL,
    PRIMARY KEY (item_id),
    -- DEC-09: 중복 정산 방지
    UNIQUE KEY uk_settlement_items_capture (capture_id),
    KEY ix_settlement_items_settlement (settlement_id),
    CONSTRAINT fk_settlement_items_settlement
        FOREIGN KEY (settlement_id) REFERENCES settlements (settlement_id),
    CONSTRAINT fk_settlement_items_capture
        FOREIGN KEY (capture_id) REFERENCES captures (capture_id)
) ENGINE = InnoDB;

-- 19. refunds — 환불 접수·처리 (DEC-08: 승인 후 72시간 이내 전액 1회)
CREATE TABLE refunds (
    refund_id        BIGINT         NOT NULL AUTO_INCREMENT,
    payment_id       BIGINT         NOT NULL,
    merchant_id      BIGINT         NOT NULL,
    request_key      VARCHAR(128)   NOT NULL,
    requested_amount DECIMAL(18, 2) NOT NULL COMMENT '1차 MVP 는 전액',
    status           VARCHAR(20)    NOT NULL COMMENT 'REQUESTED / COMPLETED / FAILED',
    reason           VARCHAR(500)   NOT NULL,
    requested_at     DATETIME(6)    NOT NULL,
    completed_at     DATETIME(6)    NULL,
    PRIMARY KEY (refund_id),
    UNIQUE KEY uk_refunds_payment (payment_id),
    UNIQUE KEY uk_refunds_merchant_request_key (merchant_id, request_key)
) ENGINE = InnoDB;

-- 25. settlement_adjustments — 지급 완료 정산을 고치지 않고 차기 정산에 환불 반영 (TEST-04)
CREATE TABLE settlement_adjustments (
    adjustment_id      BIGINT         NOT NULL AUTO_INCREMENT,
    refund_id          BIGINT         NOT NULL,
    merchant_id        BIGINT         NOT NULL,
    amount             DECIMAL(18, 2) NOT NULL COMMENT '차기 정산에서 차감할 금액',
    next_settlement_id BIGINT         NULL COMMENT '반영된 정산. 미반영은 NULL',
    created_at         DATETIME(6)    NOT NULL,
    PRIMARY KEY (adjustment_id),
    -- 동일 refund_id 조정은 한 번만 반영
    UNIQUE KEY uk_settlement_adjustments_refund (refund_id),
    KEY ix_settlement_adjustments_pending (merchant_id, next_settlement_id),
    CONSTRAINT fk_settlement_adjustments_refund
        FOREIGN KEY (refund_id) REFERENCES refunds (refund_id),
    CONSTRAINT fk_settlement_adjustments_settlement
        FOREIGN KEY (next_settlement_id) REFERENCES settlements (settlement_id)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- Cashflow — settlement 모듈 내부 서비스 소유 (DEC-11)
-- ---------------------------------------------------------------------------

-- 20. cashflow_assumptions — 수기/모의 시작 잔액. 실계좌 잔액이 아니다.
--     MER-05 의 PUT /api/merchant/cashflow/assumptions 가 가맹점당 1행을 갱신한다.
CREATE TABLE cashflow_assumptions (
    assumption_id   BIGINT         NOT NULL AUTO_INCREMENT,
    merchant_id     BIGINT         NOT NULL,
    opening_balance DECIMAL(18, 2) NOT NULL,
    base_date       DATE           NOT NULL,
    updated_at      DATETIME(6)    NOT NULL,
    PRIMARY KEY (assumption_id),
    UNIQUE KEY uk_cashflow_assumptions_merchant (merchant_id)
) ENGINE = InnoDB;

-- 21. planned_cashflows — 직접 입력한 예정 유출입
CREATE TABLE planned_cashflows (
    plan_id       BIGINT         NOT NULL AUTO_INCREMENT,
    merchant_id   BIGINT         NOT NULL,
    direction     VARCHAR(6)     NOT NULL COMMENT 'IN / OUT',
    amount        DECIMAL(18, 2) NOT NULL,
    expected_date DATE           NOT NULL,
    category      VARCHAR(50)    NULL,
    description   VARCHAR(200)   NULL,
    PRIMARY KEY (plan_id),
    -- 7일/30일 예측의 일별 누적 합
    KEY ix_planned_cashflows_merchant_date (merchant_id, expected_date)
) ENGINE = InnoDB;

-- 22. funding_options — 금융상품 추천용 모의 카탈로그. 실대출 실행 없음.
CREATE TABLE funding_options (
    option_id     BIGINT         NOT NULL AUTO_INCREMENT,
    product_name  VARCHAR(160)   NOT NULL,
    provider_name VARCHAR(120)   NOT NULL,
    min_amount    DECIMAL(18, 2) NULL,
    max_amount    DECIMAL(18, 2) NULL,
    source_label  VARCHAR(200)   NOT NULL COMMENT '모의 데이터 표기 필수',
    active        BOOLEAN        NOT NULL DEFAULT TRUE,
    PRIMARY KEY (option_id),
    KEY ix_funding_options_active (active)
) ENGINE = InnoDB;
