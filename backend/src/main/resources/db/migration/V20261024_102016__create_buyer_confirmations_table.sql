-- create_buyer_confirmations_table
-- 생성: 2026-10-24 10:20:16 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P5 payment · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)
-- 응답은 약한 근거일 뿐이다. 이 값만으로 매입 · 취소하지 않고 AI 재조사 이벤트로 넘긴다

-- "본인 결제가 맞나요?" 구매자 응답 (메일 1통당 1회)
CREATE TABLE buyer_confirmations
(
    confirmation_id BIGINT      NOT NULL AUTO_INCREMENT,
    notification_id BIGINT      NOT NULL,
    payment_id      BIGINT      NOT NULL,
    answer          VARCHAR(20) NOT NULL,                     -- MINE / NOT_MINE
    client_ip       VARCHAR(45) NULL,
    responded_at    DATETIME(6) NOT NULL,                     -- UTC
    PRIMARY KEY (confirmation_id),
    CONSTRAINT uk_buyer_confirmations_notification UNIQUE (notification_id),
    CONSTRAINT fk_buyer_confirmations_notification FOREIGN KEY (notification_id) REFERENCES notifications (notification_id),
    CONSTRAINT fk_buyer_confirmations_payment FOREIGN KEY (payment_id) REFERENCES payments (payment_id)
);
