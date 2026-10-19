-- ---------------------------------------------------------------------------
-- fds 모듈 — 위험 점수·판정 스냅샷·Alert
-- 정본: Notion 04-2 테이블 09~10, 05-2 C02
--
-- payments 는 payment 모듈 소유이므로 payment_id 에 DB FK 를 두지 않는다 (04-1).
-- ---------------------------------------------------------------------------

-- 09. fds_evaluations — 점수·판정·근거 스냅샷
CREATE TABLE fds_evaluations (
    evaluation_id           BIGINT      NOT NULL AUTO_INCREMENT,
    payment_id              BIGINT      NOT NULL,
    merchant_id             BIGINT      NOT NULL,
    score                   INT         NOT NULL COMMENT '50만원+ +35 / 10분 3회+ +25 / 최초 수단 +30',
    decision                VARCHAR(12) NOT NULL COMMENT '<50 ALLOW / 50~80 HOLD / >80 DENY',
    recent_count_10m        INT         NOT NULL COMMENT '현재 요청 포함, merchant_id+customer_ref 기준',
    is_first_payment_method BOOLEAN     NOT NULL,
    rule_snapshot           JSON        NULL COMMENT '적용된 룰과 가점 근거',
    evaluated_at            DATETIME(6) NOT NULL,
    PRIMARY KEY (evaluation_id),
    -- C02: 중복 evaluate 는 최초 평가를 재반환
    UNIQUE KEY uk_fds_evaluations_payment (payment_id),
    KEY ix_fds_evaluations_merchant_time (merchant_id, evaluated_at)
) ENGINE = InnoDB;

-- 10. fds_alerts — FDS 위험 경보
--     04-2: HOLD·DENY 는 Alert 생성, ALLOW 는 평가 이력만 저장
CREATE TABLE fds_alerts (
    alert_id      BIGINT      NOT NULL AUTO_INCREMENT,
    evaluation_id BIGINT      NOT NULL,
    payment_id    BIGINT      NOT NULL,
    severity      VARCHAR(20) NOT NULL,
    status        VARCHAR(20) NOT NULL,
    occurred_at   DATETIME(6) NOT NULL,
    PRIMARY KEY (alert_id),
    KEY ix_fds_alerts_payment (payment_id),
    KEY ix_fds_alerts_status_time (status, occurred_at),
    CONSTRAINT fk_fds_alerts_evaluation
        FOREIGN KEY (evaluation_id) REFERENCES fds_evaluations (evaluation_id)
) ENGINE = InnoDB;
