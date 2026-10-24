-- create_notifications_table
-- 생성: 2026-10-24 10:20:15 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P5 payment · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)
-- 구매자 메일에는 상태만 쓴다 (판정 사유 · 점수 금지). 사장님 메일(자금 등)도 여기서 보낸다

-- 메일 발송 기록
CREATE TABLE notifications
(
    notification_id    BIGINT       NOT NULL AUTO_INCREMENT,
    payment_id         BIGINT       NULL,                     -- 결제와 무관한 메일(자금 안내)이면 NULL
    recipient_type     VARCHAR(20)  NOT NULL,                 -- BUYER / OWNER
    recipient_email    VARCHAR(254) NOT NULL,
    kind               VARCHAR(20)  NOT NULL,                 -- FDS / RESULT / FUNDS / PAYMENT / CHECK
    subject            VARCHAR(200) NOT NULL,
    status             VARCHAR(20)  NOT NULL,                 -- PENDING / SENT / FAILED
    confirm_token_hash VARCHAR(64)  NULL,                     -- CHECK(본인 확인 요청) 링크 토큰 해시
    token_expires_at   DATETIME(6)  NULL,
    created_at         DATETIME(6)  NOT NULL,                 -- UTC
    sent_at            DATETIME(6)  NULL,
    failure_reason     VARCHAR(500) NULL,
    PRIMARY KEY (notification_id),
    CONSTRAINT uk_notifications_confirm_token UNIQUE (confirm_token_hash),
    CONSTRAINT fk_notifications_payment FOREIGN KEY (payment_id) REFERENCES payments (payment_id)
);

-- 결제별 · 받는 사람별 메일함
CREATE INDEX idx_notifications_payment ON notifications (payment_id);
CREATE INDEX idx_notifications_recipient_created ON notifications (recipient_email, created_at);
