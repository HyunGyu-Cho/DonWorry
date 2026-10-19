-- ---------------------------------------------------------------------------
-- Spring Modulith Event Publication Registry (인프라 테이블, 업무 25개 테이블과 별도)
-- 정본: Notion 05-3 — CaseDecisionMade 영속 발행, 재시작 후 미완료 이벤트 재처리
--
-- 컬럼 구성은 spring-modulith-events-jpa 2.1.1 의 JpaEventPublication 엔티티를
-- Hibernate 가 MariaDB 12.2 에 생성한 결과에서 가져왔다. 단, 아래 세 컬럼은
-- Hibernate 기본값(VARCHAR(255))이 실제 페이로드에 비해 좁아 의도적으로 넓혔다.
--   listener_id / event_type : 255 → 512  (FQCN + 메서드 시그니처가 넘길 수 있음)
--   serialized_event         : 255 → TEXT (직렬화된 이벤트 JSON)
-- 이 차이 때문에 spring.jpa.hibernate.ddl-auto 는 none 을 유지한다. validate 로
-- 바꾸면 길이 불일치로 기동이 실패한다.
--
-- id 는 MariaDB 의 native UUID 타입이다 (MariaDB 10.7 이상 필요).
-- ---------------------------------------------------------------------------

CREATE TABLE event_publication (
    id                     UUID         NOT NULL,
    listener_id            VARCHAR(512) NOT NULL,
    event_type             VARCHAR(512) NOT NULL,
    serialized_event       TEXT         NOT NULL,
    publication_date       DATETIME(6)  NOT NULL,
    completion_date        DATETIME(6)  NULL COMMENT 'NULL = 미완료. 재시작 시 재처리 대상',
    last_resubmission_date DATETIME(6)  NULL,
    completion_attempts    INT          NOT NULL DEFAULT 0,
    status                 VARCHAR(20)  NULL COMMENT 'PUBLISHED / PROCESSING / COMPLETED / FAILED / RESUBMITTED',
    PRIMARY KEY (id),
    -- 미완료 이벤트 재탐색
    KEY ix_event_publication_completion_date (completion_date),
    KEY ix_event_publication_listener (listener_id)
) ENGINE = InnoDB;
