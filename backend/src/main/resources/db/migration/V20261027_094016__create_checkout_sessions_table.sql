-- create_checkout_sessions_table
-- 생성: 2026-10-27 09:40:16 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다


-- 돈워리 결제창 1회용 세션 (P5, #82) — 구매자는 로그인 없이 이 토큰으로만 결제창에 들어온다
-- 토큰 원문은 저장하지 않고 SHA-256 해시만 둔다 (cakeshop-contract 9절)
CREATE TABLE checkout_sessions
(
    session_id  BIGINT       NOT NULL AUTO_INCREMENT,
    payment_id  BIGINT       NOT NULL,                -- 같은 P5 payments라 물리 FK
    token_hash  CHAR(64)     NOT NULL,                -- SHA-256 hex
    return_url  VARCHAR(500) NOT NULL,                -- 결제 뒤 돌려보낼 상점 주소
    expires_at  DATETIME(6)  NOT NULL,                -- UTC, 발급 후 15분
    used_at     DATETIME(6)  NULL,                    -- 결제 실행 시각, 한 번만
    client_ip   VARCHAR(45)  NULL,                    -- 결제창이 직접 수집한 접속 IP
    device_id   VARCHAR(100) NULL,                    -- 결제창 기기 식별 쿠키
    created_at  DATETIME(6)  NOT NULL,                -- UTC
    PRIMARY KEY (session_id),
    CONSTRAINT uk_checkout_sessions_token UNIQUE (token_hash),
    CONSTRAINT fk_checkout_sessions_payment FOREIGN KEY (payment_id) REFERENCES payments (payment_id)
);
