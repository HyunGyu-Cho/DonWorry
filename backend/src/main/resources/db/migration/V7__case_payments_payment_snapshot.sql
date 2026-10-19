-- ---------------------------------------------------------------------------
-- case_payments 에 연결 시점 결제 스냅샷 추가
-- 정본: docs/decisions/0003-investigation-payment-cycle.md (ADR-0003, A안 채택)
--
-- investigation 은 payment 에 Java 로 의존하지 않는다. 그래서 SEC-01·02 화면이 쓰는
-- 결제 사실을 PaymentReader 로 조회하지 않고, C03 CaseLinkRequest 가 함께 넘긴 값을
-- 연결 시점에 여기 보관한다.
--
-- 이 값은 '연결 시점'의 사실이며 결제의 현재 상태가 아니다. 결제 상태 정본은
-- payment.payments 이고, 이후의 최종 판정은 case_decisions 에 남는다.
-- 화면 표시 문구에도 연결 시점임을 드러낸다 (03-2).
--
-- V4 는 이미 푸시되었으므로 수정하지 않고 새 버전을 더한다 (06-3).
-- ---------------------------------------------------------------------------

ALTER TABLE case_payments
    ADD COLUMN order_id       VARCHAR(100)   NOT NULL COMMENT 'SEC-02 주문 참조. 연결 시점 값' AFTER payment_id,
    ADD COLUMN amount         DECIMAL(18, 2) NOT NULL COMMENT 'SEC-02 결제금액. 연결 시점 값, KRW 원 단위' AFTER order_id,
    ADD COLUMN payment_status VARCHAR(20)    NOT NULL COMMENT 'SEC-02 결제 상태. 연결 시점 값(HELD). 현재 상태가 아니다' AFTER amount;

-- SEC-01 목록의 보류 금액 합계를 Case 단위로 집계할 때 쓴다.
CREATE INDEX ix_case_payments_case_status ON case_payments (case_id, payment_status);
