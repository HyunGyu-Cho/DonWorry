-- ---------------------------------------------------------------------------
-- payment 모듈 — 결제 접수·상태·모의 카드 승인·CakeShop 결과 통보
-- 정본: Notion 04-2 테이블 06~08, 04-3 DEC-06·DEC-07·DEC-12, 05-3 상태 전이
--
-- merchants 는 identity 모듈 소유이므로 merchant_id 에 DB FK 를 두지 않는다 (04-1).
-- ---------------------------------------------------------------------------

-- 06. payments — PG 결제 상태 정본
CREATE TABLE payments (
    payment_id          BIGINT         NOT NULL AUTO_INCREMENT,
    merchant_id         BIGINT         NOT NULL,
    order_id            VARCHAR(100)   NOT NULL COMMENT 'CakeShop 주문 ID',
    customer_ref        VARCHAR(128)   NOT NULL,
    payment_method_ref  VARCHAR(128)   NOT NULL,
    amount              DECIMAL(18, 2) NOT NULL COMMENT 'KRW 원 단위',
    currency            CHAR(3)        NOT NULL DEFAULT 'KRW',
    status              VARCHAR(20)    NOT NULL COMMENT 'RECEIVED / HELD / AUTHORIZING / APPROVED / REJECTED / FAILED_RISK',
    risk_decision       VARCHAR(12)    NULL COMMENT 'ALLOW / HOLD / DENY',
    rejection_source    VARCHAR(32)    NULL COMMENT 'FDS / SECURITY_STAFF / CARD 등',
    case_link_status    VARCHAR(16)    NULL COMMENT 'DEC-06 PENDING / LINKED / RETRY / ERROR',
    request_fingerprint VARCHAR(128)   NULL COMMENT 'DEC-07 동일 주문 재전송의 금액·수단 변경 판별',
    created_at          DATETIME(6)    NOT NULL,
    updated_at          DATETIME(6)    NOT NULL,
    approved_at         DATETIME(6)    NULL COMMENT 'DEC-08 환불 72시간 기산점',
    refunded_at         DATETIME(6)    NULL COMMENT '환불 정본은 settlement.refunds. 조회 편의용',
    PRIMARY KEY (payment_id),
    -- DEC-07: 주문당 결제 시도 1회
    UNIQUE KEY uk_payments_merchant_order (merchant_id, order_id),
    -- C02 / TEST-01: 최근 10분 결제 건수 집계
    KEY ix_payments_merchant_customer_time (merchant_id, customer_ref, created_at),
    -- MER-02 결제 내역 조회
    KEY ix_payments_merchant_status_time (merchant_id, status, created_at),
    -- DEC-06: 미연결 HELD 결제 재탐색 (재시작 복구 포함)
    KEY ix_payments_case_link_status (case_link_status, updated_at)
) ENGINE = InnoDB;

-- 07. payment_authorizations — 모의 카드 승인 호출/결과 (C07)
CREATE TABLE payment_authorizations (
    authorization_id BIGINT       NOT NULL AUTO_INCREMENT,
    payment_id       BIGINT       NOT NULL,
    request_key      VARCHAR(128) NOT NULL COMMENT 'DEC-07 paymentId:AUTH',
    provider         VARCHAR(30)  NOT NULL COMMENT 'MOCK_CARD',
    decision         VARCHAR(20)  NULL COMMENT 'APPROVED / DECLINED. 미완료는 NULL',
    response_code    VARCHAR(50)  NULL,
    attempted_at     DATETIME(6)  NOT NULL,
    completed_at     DATETIME(6)  NULL,
    PRIMARY KEY (authorization_id),
    -- 중복 승인 요청 방지: 같은 키는 저장된 결과를 재반환
    UNIQUE KEY uk_payment_authorizations_request_key (request_key),
    KEY ix_payment_authorizations_payment (payment_id),
    CONSTRAINT fk_payment_authorizations_payment
        FOREIGN KEY (payment_id) REFERENCES payments (payment_id)
) ENGINE = InnoDB;

-- 08. payment_notifications — CakeShop 최종 결과 HTTP 통보 및 재시도 (DEC-12 / C06)
CREATE TABLE payment_notifications (
    notification_id BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'CakeShop 으로 보내는 멱등 키',
    payment_id      BIGINT       NOT NULL,
    target          VARCHAR(32)  NOT NULL COMMENT 'CAKESHOP',
    status          VARCHAR(20)  NOT NULL COMMENT 'PENDING / SENT / FAILED',
    attempts        INT          NOT NULL DEFAULT 0 COMMENT '최대 5회 (10초/30초/1분/5분/15분)',
    last_error      VARCHAR(500) NULL,
    next_retry_at   DATETIME(6)  NULL,
    created_at      DATETIME(6)  NOT NULL,
    sent_at         DATETIME(6)  NULL,
    PRIMARY KEY (notification_id),
    UNIQUE KEY uk_payment_notifications_payment_target (payment_id, target),
    -- 재시도 스케줄러 재탐색 (프로세스 재시작 포함)
    KEY ix_payment_notifications_status_retry (status, next_retry_at),
    CONSTRAINT fk_payment_notifications_payment
        FOREIGN KEY (payment_id) REFERENCES payments (payment_id)
) ENGINE = InnoDB;
