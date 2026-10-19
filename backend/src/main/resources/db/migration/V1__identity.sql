-- ---------------------------------------------------------------------------
-- identity 모듈 — 가맹점·직원 계정·로그인 이벤트·접근 권한
-- 정본: Notion 04-2 테이블 상세 명세 01~05 / 24, 04-3 DEC-10·DEC-13
--
-- 모듈 간 참조에는 DB FK 를 두지 않는다 (04-1). 같은 모듈 안에서만 FK 를 쓴다.
-- ---------------------------------------------------------------------------

-- 01. merchants — 가맹점 경계 및 CakeShop 연동 소유자
CREATE TABLE merchants (
    merchant_id   BIGINT       NOT NULL AUTO_INCREMENT,
    merchant_code VARCHAR(64)  NOT NULL COMMENT 'CakeShop 이 보내는 X-Merchant-Code',
    name          VARCHAR(160) NOT NULL,
    status        VARCHAR(20)  NOT NULL COMMENT 'ACTIVE / INACTIVE',
    created_at    DATETIME(6)  NOT NULL,
    updated_at    DATETIME(6)  NOT NULL,
    PRIMARY KEY (merchant_id),
    UNIQUE KEY uk_merchants_merchant_code (merchant_code)
) ENGINE = InnoDB;

-- 02. platform_users — 직원 인증 및 RBAC (DEC-13 단일 역할)
CREATE TABLE platform_users (
    user_id       BIGINT       NOT NULL AUTO_INCREMENT,
    merchant_id   BIGINT       NULL COMMENT 'MERCHANT_OWNER 의 소속 가맹점. 플랫폼 직원은 NULL',
    email         VARCHAR(200) NOT NULL,
    password_hash VARCHAR(255) NOT NULL COMMENT '원문 저장 금지',
    role          VARCHAR(32)  NOT NULL COMMENT 'PLATFORM_ADMIN / SECURITY_STAFF / MERCHANT_OWNER',
    status        VARCHAR(20)  NOT NULL COMMENT 'ACTIVE / DISABLED',
    locked_until  DATETIME(6)  NULL COMMENT 'DEC-10 자동 잠금 만료 시각. 만료 후 자동 해제',
    last_login_at DATETIME(6)  NULL,
    created_at    DATETIME(6)  NOT NULL,
    PRIMARY KEY (user_id),
    UNIQUE KEY uk_platform_users_email (email),
    KEY ix_platform_users_merchant (merchant_id),
    CONSTRAINT fk_platform_users_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id)
) ENGINE = InnoDB;

-- 03. login_events — SEC-03 로그인 신호
--     DEC-10: 1차 MVP 는 DonWorry 직원 로그인 이벤트만. CakeShop 구매자 로그인 제외.
CREATE TABLE login_events (
    event_id     BIGINT       NOT NULL AUTO_INCREMENT,
    merchant_id  BIGINT       NULL,
    user_id      BIGINT       NULL COMMENT '식별된 직원 계정. 미확인 시도는 NULL',
    subject_type VARCHAR(32)  NOT NULL COMMENT 'PLATFORM_USER',
    subject_ref  VARCHAR(128) NOT NULL COMMENT '시도한 식별자(이메일 등)',
    result       VARCHAR(20)  NOT NULL COMMENT 'SUCCESS / FAILURE',
    ip_address   VARCHAR(45)  NOT NULL,
    device_ref   VARCHAR(128) NULL,
    occurred_at  DATETIME(6)  NOT NULL,
    PRIMARY KEY (event_id),
    -- DEC-10 간단 룰: 동일 계정 10분 내 실패 5회 조회
    KEY ix_login_events_subject_result_time (subject_ref, result, occurred_at),
    KEY ix_login_events_user_time (user_id, occurred_at),
    KEY ix_login_events_merchant_time (merchant_id, occurred_at)
) ENGINE = InnoDB;

-- 04. security_actions — 계정 잠금 등 실행 조치 감사
CREATE TABLE security_actions (
    action_id      BIGINT       NOT NULL AUTO_INCREMENT,
    login_event_id BIGINT       NULL,
    target_type    VARCHAR(32)  NOT NULL,
    target_ref     VARCHAR(128) NOT NULL,
    action_type    VARCHAR(32)  NOT NULL COMMENT 'ACCOUNT_LOCK / ACCOUNT_UNLOCK 등',
    status         VARCHAR(24)  NOT NULL,
    actor_user_id  BIGINT       NULL COMMENT '자동 조치는 NULL',
    performed_at   DATETIME(6)  NOT NULL,
    PRIMARY KEY (action_id),
    KEY ix_security_actions_target (target_type, target_ref, performed_at),
    CONSTRAINT fk_security_actions_login_event
        FOREIGN KEY (login_event_id) REFERENCES login_events (event_id),
    CONSTRAINT fk_security_actions_actor
        FOREIGN KEY (actor_user_id) REFERENCES platform_users (user_id)
) ENGINE = InnoDB;

-- 05. merchant_credentials — CakeShop↔PG 인증 (TEST-05: 해시로만 검증)
CREATE TABLE merchant_credentials (
    credential_id BIGINT       NOT NULL AUTO_INCREMENT,
    merchant_id   BIGINT       NOT NULL,
    key_hash      VARCHAR(255) NOT NULL COMMENT 'API Key 해시. 원문 저장·재노출 금지',
    status        VARCHAR(16)  NOT NULL COMMENT 'ACTIVE / REVOKED',
    issued_at     DATETIME(6)  NOT NULL,
    revoked_at    DATETIME(6)  NULL,
    PRIMARY KEY (credential_id),
    KEY ix_merchant_credentials_merchant_status (merchant_id, status),
    CONSTRAINT fk_merchant_credentials_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id)
) ENGINE = InnoDB;

-- 24. user_merchant_access — SECURITY_STAFF 가 접근 가능한 가맹점 한정 (DEC-13)
CREATE TABLE user_merchant_access (
    access_id   BIGINT      NOT NULL AUTO_INCREMENT,
    user_id     BIGINT      NOT NULL,
    merchant_id BIGINT      NOT NULL,
    granted_at  DATETIME(6) NOT NULL,
    PRIMARY KEY (access_id),
    UNIQUE KEY uk_user_merchant_access (user_id, merchant_id),
    KEY ix_user_merchant_access_merchant (merchant_id),
    CONSTRAINT fk_user_merchant_access_user
        FOREIGN KEY (user_id) REFERENCES platform_users (user_id),
    CONSTRAINT fk_user_merchant_access_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id)
) ENGINE = InnoDB;
