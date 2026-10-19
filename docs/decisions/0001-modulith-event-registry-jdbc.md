# 0001. Modulith 이벤트 레지스트리를 JDBC 구현으로

- **상태:** 채택
- **날짜:** 2026-10-20
- **관련:** Notion 05-3, 06-1, 06-3, 06-4

## 배경

Notion 06-1·06-3·06-4가 세 곳에서 `spring.jpa.hibernate.ddl-auto=validate`를 요구한다.
엔티티 매핑이 Flyway 스키마와 어긋나면 기동 단계에서 막는 것이 목적이다.

처음에는 `spring-modulith-starter-jpa`를 썼다. 이 구현은 `event_publication`을 JPA 엔티티로
들고 있어 Hibernate가 검사 대상에 포함한다. 그런데 Hibernate가 생성하는 기본 컬럼 길이는
`LISTENER_ID` / `EVENT_TYPE` / `SERIALIZED_EVENT` 모두 `VARCHAR(255)`로, 실제 페이로드에
비해 좁다. 직렬화된 이벤트 JSON이 255자를 넘으면 런타임에 잘린다.

Flyway 쪽에서 컬럼을 넓히면 `validate`가 길이 불일치로 기동을 거부했다. 넓히지 않으면
이벤트 저장이 깨진다. 그래서 `ddl-auto`를 `none`으로 두고 있었고, 이는 06-1 위반이었다.

## 결정

`spring-modulith-starter-jpa` 대신 `spring-modulith-starter-jdbc`를 쓴다.
`EVENT_PUBLICATION`이 JPA 엔티티가 아니게 되므로 `validate` 검사 대상에서 빠지고,
업무 테이블에 대해서만 매핑 검사가 돈다. `ddl-auto=validate`를 켤 수 있다.

`V6__modulith_event_publication.sql`은 Modulith가 배포하는
`org/springframework/modulith/events/jdbc/schemas/v2/schema-mariadb.sql` 원본을 그대로 쓴다.

## 고려한 대안

| 대안 | 버린 이유 |
| --- | --- |
| `ddl-auto=none` 유지 | 06-1·06-3·06-4를 세 곳에서 위반한다. 25개 테이블을 6명이 각자 매핑하는데 컬럼명·타입 불일치를 기동 시점에 잡을 장치가 사라진다 |
| V6를 Hibernate 기본 길이에 맞춤 | `SERIALIZED_EVENT VARCHAR(255)`로는 실제 이벤트 JSON이 잘린다. 데이터 손실을 설정 일관성과 바꾸는 선택 |
| JPA 엔티티만 validate에서 제외 | Hibernate `validate`는 테이블 단위 제외를 지원하지 않는다 |
| JPA를 버리고 전부 JDBC | 업무 코드 영향이 과도하다. 문제는 인프라 테이블 하나였다 |

## 영향

- **API:** 없음.
- **DB:** `V6`를 v2 공식 스키마로 교체했다. 어떤 공유 DB에도 적용된 적이 없어 파일을 직접 고쳤다.
  이미 적용한 로컬 DB가 있으면 Flyway 체크섬 오류가 나므로 `donworry` 스키마를 드롭하고 다시 받는다.
- **화면:** 없음.
- **테스트:** `SchemaMigrationTests`가 테이블 26개와 `validate` 기동을 확인한다.
- **문서:** `application.yml`을 `validate`로, README 스키마 절을 갱신했다.

## 유의할 점

- JPA 구현으로 되돌리면 `validate`와 다시 충돌한다.
- `spring.modulith.events.jdbc.use-legacy-structure`는 `false`를 유지해야 한다.
  `true`면 Modulith가 V1 구조를 기대해 조회가 깨진다.
- JDBC 구현도 같은 `DataSource`와 같은 트랜잭션에 참여한다. `case_decisions` INSERT와
  `CaseDecisionMade` 발행 기록이 한 트랜잭션에 묶이는 05-3 요구는 그대로 유지된다.

## 검증

임시 MariaDB 12.2 인스턴스에서 `V1~V6` 적용 후 `validate`로 기동 성공,
`EVENT_PUBLICATION` 컬럼 9개 확인. `./gradlew check` 통과. GitHub Actions `schema` 잡이
MariaDB 11.8 컨테이너에서 같은 검사를 통과했다.
