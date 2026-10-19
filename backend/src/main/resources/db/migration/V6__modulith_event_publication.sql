-- ---------------------------------------------------------------------------
-- Spring Modulith Event Publication Registry (인프라 테이블, 업무 25개 테이블과 별도)
-- 정본: Notion 05-3 — CaseDecisionMade 영속 발행, 재시작 후 미완료 이벤트 재처리
--
-- 내용은 spring-modulith-events-jdbc 2.1.1 이 제공하는
--   org/springframework/modulith/events/jdbc/schemas/v2/schema-mariadb.sql
-- 을 그대로 쓴다. 직접 손대지 말고 Modulith 버전을 올릴 때 해당 파일과 다시 대조할 것.
--
-- V2 구조를 쓰므로 spring.modulith.events.jdbc.use-legacy-structure 는 기본값(false)을
-- 유지해야 한다. true 로 바꾸면 Modulith 가 V1 구조를 기대해 조회가 깨진다.
--
-- 테이블 생성 주체는 Flyway 다. spring.modulith.events.jdbc.schema-initialization.enabled
-- 는 false 로 두어 Modulith 가 직접 만들지 않게 한다.
--
-- JDBC 구현이라 JPA 엔티티가 아니므로 ddl-auto=validate 검사 대상이 아니다.
-- 식별자는 Modulith 코드가 참조하는 대문자 이름을 유지한다 (Linux 의
-- lower_case_table_names=0 환경에서 대소문자가 구분된다).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS EVENT_PUBLICATION
(
    ID                     VARCHAR(36)   NOT NULL,
    LISTENER_ID            VARCHAR(512)  NOT NULL,
    EVENT_TYPE             VARCHAR(512)  NOT NULL,
    SERIALIZED_EVENT       VARCHAR(4000) NOT NULL,
    PUBLICATION_DATE       TIMESTAMP(6)  NOT NULL,
    COMPLETION_DATE        TIMESTAMP(6)  DEFAULT NULL NULL,
    STATUS                 VARCHAR(20),
    COMPLETION_ATTEMPTS    INT,
    LAST_RESUBMISSION_DATE TIMESTAMP(6),
    PRIMARY KEY (ID),
    INDEX EVENT_PUBLICATION_BY_COMPLETION_DATE_IDX (COMPLETION_DATE)
);
