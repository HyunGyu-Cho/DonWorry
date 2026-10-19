-- ---------------------------------------------------------------------------
-- investigation 모듈 — Case·신호 연결·결제별 판정·AI 보고서
-- 정본: Notion 04-2 테이블 11~15 / 23, 04-3 DEC-01~06, 05-3 상태 전이
--
-- payments·fds_alerts·login_events·platform_users 는 다른 모듈 소유이므로
-- DB FK 를 두지 않고 공개 조회 계약으로 존재를 검증한다 (04-1, DEC-02).
-- ---------------------------------------------------------------------------

-- 11. security_cases — Case 정본
CREATE TABLE security_cases (
    case_id          BIGINT       NOT NULL AUTO_INCREMENT,
    merchant_id      BIGINT       NOT NULL,
    subject_type     VARCHAR(32)  NOT NULL COMMENT 'DEC-04 PAYMENT_CUSTOMER / PLATFORM_USER',
    subject_ref      VARCHAR(128) NOT NULL,
    case_type        VARCHAR(32)  NOT NULL COMMENT 'DEC-04 PAYMENT_FRAUD / LOGIN_SECURITY',
    status           VARCHAR(20)  NOT NULL COMMENT 'OPEN / INVESTIGATING / CLOSED',
    evidence_version BIGINT       NOT NULL DEFAULT 0 COMMENT 'DEC-05 새 신호·결제 연결 시 +1',
    last_evidence_at DATETIME(6)  NULL COMMENT 'DEC-04 재사용 30분 기준이 되는 마지막 신규 증거 시각',
    opened_at        DATETIME(6)  NOT NULL,
    updated_at       DATETIME(6)  NOT NULL,
    closed_at        DATETIME(6)  NULL,
    PRIMARY KEY (case_id),
    -- DEC-04 재사용 후보 검색: 같은 키 + 미해결 + 최근 신규 증거 30분 이내
    KEY ix_security_cases_reuse (merchant_id, subject_type, subject_ref, case_type, status, last_evidence_at),
    -- SEC-01 통합 Case 목록
    KEY ix_security_cases_status_updated (status, updated_at)
) ENGINE = InnoDB;

-- 23. case_subject_locks — 같은 조사 대상·유형의 Case 찾기·생성 직렬화 (DEC-04)
--     INSERT IGNORE 로 잠금 행을 선점한 뒤 SELECT ... FOR UPDATE 로 직렬화한다.
CREATE TABLE case_subject_locks (
    lock_id      BIGINT       NOT NULL AUTO_INCREMENT,
    merchant_id  BIGINT       NOT NULL,
    subject_type VARCHAR(32)  NOT NULL,
    subject_ref  VARCHAR(128) NOT NULL,
    case_type    VARCHAR(32)  NOT NULL,
    created_at   DATETIME(6)  NOT NULL,
    PRIMARY KEY (lock_id),
    UNIQUE KEY uk_case_subject_locks (merchant_id, subject_type, subject_ref, case_type)
) ENGINE = InnoDB;

-- 12. case_signals — 로그인/FDS 이종 신호 연결 (DEC-02)
CREATE TABLE case_signals (
    case_signal_id BIGINT      NOT NULL AUTO_INCREMENT,
    case_id        BIGINT      NOT NULL,
    source_type    VARCHAR(24) NOT NULL COMMENT 'FDS_ALERT / LOGIN_EVENT',
    source_id      BIGINT      NOT NULL COMMENT '원천 모듈의 ID. FK 없이 공개 조회로 검증',
    occurred_at    DATETIME(6) NOT NULL,
    linked_at      DATETIME(6) NOT NULL,
    PRIMARY KEY (case_signal_id),
    -- DEC-02: Alert 당 Case 최대 1건
    UNIQUE KEY uk_case_signals_source (source_type, source_id),
    KEY ix_case_signals_case (case_id),
    CONSTRAINT fk_case_signals_case
        FOREIGN KEY (case_id) REFERENCES security_cases (case_id)
) ENGINE = InnoDB;

-- 13. case_payments — HELD 결제의 Case 연결 (DEC-01)
CREATE TABLE case_payments (
    case_payment_id BIGINT      NOT NULL AUTO_INCREMENT,
    case_id         BIGINT      NOT NULL,
    payment_id      BIGINT      NOT NULL,
    linked_at       DATETIME(6) NOT NULL,
    ended_at        DATETIME(6) NULL COMMENT '재배정 용도로 사용하지 않음 (04-2)',
    PRIMARY KEY (case_payment_id),
    -- DEC-01: 결제당 Case 연결 1행
    UNIQUE KEY uk_case_payments_payment (payment_id),
    KEY ix_case_payments_case (case_id),
    CONSTRAINT fk_case_payments_case
        FOREIGN KEY (case_id) REFERENCES security_cases (case_id)
) ENGINE = InnoDB;

-- 14. case_decisions — 결제별 직원 판정 감사 (DEC-03 / C05)
CREATE TABLE case_decisions (
    decision_id   BIGINT        NOT NULL AUTO_INCREMENT,
    case_id       BIGINT        NOT NULL,
    payment_id    BIGINT        NOT NULL,
    actor_user_id BIGINT        NOT NULL,
    decision      VARCHAR(12)   NOT NULL COMMENT 'REJECT / RELEASE',
    reason        VARCHAR(1000) NOT NULL,
    event_id      VARCHAR(100)  NOT NULL COMMENT 'CaseDecisionMade 멱등 키',
    decided_at    DATETIME(6)   NOT NULL,
    PRIMARY KEY (decision_id),
    -- DEC-03: 결제당 최종 직원 판정 1회
    UNIQUE KEY uk_case_decisions_payment (payment_id),
    UNIQUE KEY uk_case_decisions_event (event_id),
    KEY ix_case_decisions_case (case_id),
    CONSTRAINT fk_case_decisions_case
        FOREIGN KEY (case_id) REFERENCES security_cases (case_id)
) ENGINE = InnoDB;

-- 15. ai_reports — 증거 버전 기반 보고서 (DEC-05, append-only)
--     원본 카드번호·비밀번호 보관 금지.
CREATE TABLE ai_reports (
    report_id        BIGINT      NOT NULL AUTO_INCREMENT,
    case_id          BIGINT      NOT NULL,
    version          INT         NOT NULL,
    status           VARCHAR(20) NOT NULL COMMENT 'PENDING / COMPLETED / FAILED',
    summary          TEXT        NULL,
    recommendation   VARCHAR(30) NULL,
    evidence_version BIGINT      NULL COMMENT 'Case.evidence_version 과 다르면 STALE',
    requested_at     DATETIME(6) NOT NULL,
    completed_at     DATETIME(6) NULL,
    PRIMARY KEY (report_id),
    UNIQUE KEY uk_ai_reports_case_version (case_id, version),
    CONSTRAINT fk_ai_reports_case
        FOREIGN KEY (case_id) REFERENCES security_cases (case_id)
) ENGINE = InnoDB;
