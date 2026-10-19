# DonWorry

CakeShop(1차 프로젝트)에서 발생한 거래를 받아 **결제(PG) → FDS 위험평가 → 보안 Case 조사 → AI 조사보고서 → 보안직원 판정 → 결과 통보 → 매입·정산·자금관리**까지 처리하는 2차 프로젝트 1차 MVP.

설계 정본은 Notion `2차 프로젝트 1차 MVP` 문서 트리이며, 이 저장소는 그 구현체다. 문서와 코드가 어긋나면 **Notion 04-3(설계 결정 DEC) / 05-1~3(API·이벤트 계약)이 기준**이다.

## 핵심 시연 흐름 (1차 목표)

```
CakeShop 결제 요청
  → DonWorry PG 접수(RECEIVED)
  → FDS 60점 HOLD 판정
  → 결제 HELD 저장 (case_link_status=PENDING)
  → 커밋 후 Case 연결 (관련 미해결 Case 재사용 / 없으면 신규 OPEN)
  → FastAPI AI 조사보고서 생성
  → 보안직원 REJECT (결제별 판정)
  → CaseDecisionMade 이벤트 → 결제 REJECTED (카드사 미호출)
  → CakeShop에 반려 결과 통보
```

FDS 판정 기준: `score < 50` ALLOW / `50~80` HOLD / `> 80` DENY.
점수 규칙: 금액 50만 원 이상 +35 / 최근 10분 내 3회 이상 +25 / 최초 결제수단 +30.

## 저장소 구조

```
DonWorry/
├── backend/                         # Spring Boot 단일 애플리케이션 + 5개 업무 모듈
│   ├── build.gradle                 # Spring Boot 4.1.1 / Modulith 2.1.1 / Java 17
│   ├── settings.gradle
│   ├── gradlew, gradle/wrapper/     # Gradle Wrapper 9.3.0
│   └── src/
│       ├── main/
│       │   ├── java/com/donworry/
│       │   │   ├── DonWorryApplication.java
│       │   │   ├── identity/        # 로그인·사용자·가맹점·권한
│       │   │   ├── payment/         # PG·결제·CakeShop 연동·Mock 카드사
│       │   │   ├── fds/             # Rule Engine·위험평가·Alert
│       │   │   ├── investigation/   # Case·보안직원 판정·AI 결과 관리
│       │   │   └── settlement/      # 매입·정산·환불·자금관리(cashflow)
│       │   └── resources/
│       │       ├── application.yml
│       │       ├── application-local.yml.example
│       │       └── db/migration/    # Flyway 마이그레이션 (스키마 수동 변경 금지)
│       └── test/java/com/donworry/
│           └── ModularityTests.java # 모듈 경계 위반·순환 의존 검사
├── frontend/                        # React (아직 생성 안 됨)
└── ai-server/                       # FastAPI 조사보고서 서버 (아직 생성 안 됨)
```

- `frontend/`, `ai-server/`는 모노레포의 별도 최상위 디렉터리로 두기로 결정되어 있으나 아직 만들지 않았다.
- CakeShop은 이 저장소가 아닌 **독립 실행 애플리케이션**이다.
- 모듈 내부 하위 폴더(`api/`, `controller/`, `service/`, `repository/`, `entity/`, `dto/` 및 필요 시 `client/`, `listener/`, `security/`, `job/`)는 **실제로 필요할 때 생성**한다. 클래스·DTO·Entity 파일명은 확정 전이다.

## 모듈 경계 규칙

| 모듈 | 담당 | 책임 |
| --- | --- | --- |
| `identity` | 주환 | 인증·계정·가맹점·권한 (프론트엔드도 담당) |
| `payment` | 시은 | 결제 접수·상태 관리·Mock 카드사·CakeShop 결과 통보 |
| `fds` | 정후 | 위험 점수·ALLOW/HOLD/DENY·Alert |
| `investigation` | 수민 | Case 연결 보장·통합 조사·AI 결과·결제별 판정 |
| `settlement` | 민정 | 매입·정산·환불·자금관리 |
| `ai-server` | 현규 | FastAPI 조사보고서 생성 (Spring 모듈 아님) |

의존 방향:

- `payment → fds.api` (Java Interface, C02 위험평가)
- `payment → investigation.api` (Java Interface, C03 HELD 커밋 후 Case 연결)
- `investigation ⇢ payment` (Spring Modulith Event `CaseDecisionMade`, **역방향 Java 직접 의존 금지**)
- `investigation → ai-server` (HTTP, C04)
- `settlement → payment.api` (`PaymentReader` 공개 조회만)
- `CakeShop ↔ payment` (HTTP, C01 요청 / C06 결과 통보)

금지 사항: 다른 모듈의 `repository/`·`entity/` 직접 참조, Service 상호 주입(순환 의존), DB 스키마 수동 변경.

## 로컬 포트

| 구성 | 포트 |
| --- | --- |
| CakeShop | 8080 |
| DonWorry Spring Boot | 8081 |
| FastAPI (ai-server) | 8000 |
| MariaDB | 3306 |

React 개발 서버 포트는 별도.

## 백엔드 실행

전제: JDK 17, MariaDB 3306.

```bash
# 1) DB·계정 생성 (MariaDB 관리자 계정으로 1회)
mariadb -h 127.0.0.1 -P 3306 -u root -p < docs/db/01-create-database.sql

# 2) 개인 로컬 설정 (비밀번호·포트가 기본값과 다를 때만)
cd backend
cp src/main/resources/application-local.yml.example src/main/resources/application-local.yml

# 3) 실행 / 빌드 / 테스트
./gradlew bootRun --args='--spring.profiles.active=local'
./gradlew build
./gradlew test --tests '*ModularityTests'
```

DB 접속 정보는 환경변수로도 넘길 수 있다: `DONWORRY_DB_HOST` / `DONWORRY_DB_PORT` / `DONWORRY_DB_NAME` / `DONWORRY_DB_USER` / `DONWORRY_DB_PASSWORD` / `DONWORRY_PORT`, 외부 연동은 `CAKESHOP_BASE_URL` / `AI_SERVER_BASE_URL`.

`application-local.yml`은 `.gitignore` 대상이다. 비밀값을 `application.yml`에 적지 않는다.

> **OneDrive 주의** — 프로젝트를 OneDrive 동기화 폴더에 두면 OneDrive 가 `backend/build/` 의 파일을 잠가 `./gradlew build` 가 `Unable to delete directory ...build\test-results` / `Failed to clean up stale outputs` 로 실패할 수 있다. 이때는 `rm -rf backend/build` 후 다시 실행하면 된다. 반복되면 프로젝트를 OneDrive 밖으로 옮기는 편이 낫다.

> **DB 포트 주의** — 설정 기본값은 팀 기준인 MariaDB 3306이다. 한 머신에 MySQL이 함께 설치되어 3306을 점유한 경우 MariaDB는 다른 포트(예: 3307)로 올라가므로, 접속 전에 어느 서버가 3306을 쓰는지 확인하고 `DONWORRY_DB_PORT`로 맞춰야 한다. 확인: MariaDB 접속 후 `SHOW VARIABLES LIKE 'port';`

## 기술 스택 결정

| 항목 | 선택 | 비고 |
| --- | --- | --- |
| Java | 17 | Spring Boot 4.x 최소 버전 |
| Spring Boot | 4.1.1 | 2026-10 기준 최신 안정 버전 |
| Spring Modulith | 2.1.1 | 모듈 경계 + Event Publication Registry |
| DB | MariaDB | 드라이버 `mariadb-java-client` |
| 마이그레이션 | Flyway (+ `flyway-mysql`) | 스키마 정본, 수동 변경 금지 |

Spring Boot 4 로 올리면서 걸린 두 가지:

- Flyway 자동 구성이 별도 모듈로 분리되어 `flyway-core` 만으로는 마이그레이션이 **조용히 실행되지 않는다**. `spring-boot-starter-flyway` 가 필요하다.
- Jackson 3 으로 바뀌어 `spring.jackson.serialization.write-dates-as-timestamps` 가 사라졌다. `spring.jackson.datatype.datetime.write-dates-as-timestamps` 를 쓴다.

## 데이터베이스 스키마

Flyway 마이그레이션이 Notion 04-2 의 업무 테이블 25개와 Spring Modulith 인프라 테이블 1개를 만든다.

| 파일 | 내용 |
| --- | --- |
| `V1__identity.sql` | merchants, platform_users, login_events, security_actions, merchant_credentials, user_merchant_access |
| `V2__payment.sql` | payments, payment_authorizations, payment_notifications |
| `V3__fds.sql` | fds_evaluations, fds_alerts |
| `V4__investigation.sql` | security_cases, case_subject_locks, case_signals, case_payments, case_decisions, ai_reports |
| `V5__settlement.sql` | captures, settlements, settlement_items, refunds, settlement_adjustments, cashflow_assumptions, planned_cashflows, funding_options |
| `V6__modulith_event_publication.sql` | event_publication (업무 테이블 아님) |

규칙:

- 모듈 간 참조에는 DB FK 를 두지 않는다. 같은 모듈 안에서만 FK 를 쓰고, 다른 모듈의 ID 는 공개 조회 계약으로 존재를 검증한다 (04-1).
- `spring.jpa.hibernate.ddl-auto`는 `validate`다 (06-1). 엔티티 매핑이 Flyway 스키마와 어긋나면 기동 시점에 실패한다. `create` / `create-drop` / `update`는 공유 DB에서 금지.
- `EVENT_PUBLICATION`은 Spring Modulith 의 **JDBC** 구현을 쓰기 때문에 JPA 엔티티가 아니고, 따라서 `validate` 검사 대상이 아니다. `starter-jpa`로 되돌리면 이 테이블이 엔티티가 되어 `validate`와 충돌한다.
- `V6`는 Modulith 가 배포하는 `schemas/v2/schema-mariadb.sql` 원본이다. 직접 수정하지 말고 Modulith 버전을 올릴 때 원본과 다시 대조한다. `use-legacy-structure`는 `false` 유지.
- 적용된 마이그레이션은 수정하지 않고 새 버전 파일을 추가한다.
- 04-2 에 없는데 추가한 것: `cashflow_assumptions`의 `UNIQUE(merchant_id)` (MER-05 가 가맹점당 1행을 `PUT` 으로 갱신하므로), 그리고 재시도·스케줄러 재탐색용 인덱스 몇 개. `status` 류 컬럼은 명세대로 `VARCHAR` 이며 `CHECK` 제약은 걸지 않았다.

## 아직 없는 것

- `SecurityConfig` — `spring-boot-starter-security`만 들어가 있어 현재는 모든 요청이 인증을 요구한다.
- 25개 테이블에 대응하는 JPA 엔티티·리포지토리, C01~C07 API·이벤트 구현, 업무 테스트.
- 시연용 시드 데이터(가맹점·API Key·직원 계정).
- `frontend/`, `ai-server/` 디렉터리.
