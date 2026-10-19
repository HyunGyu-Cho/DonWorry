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
# 1) DB 준비
#    CREATE DATABASE donworry DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
#    CREATE USER 'donworry'@'localhost' IDENTIFIED BY '...';
#    GRANT ALL PRIVILEGES ON donworry.* TO 'donworry'@'localhost';

# 2) 개인 로컬 설정 (비밀번호가 기본값과 다를 때만)
cd backend
cp src/main/resources/application-local.yml.example src/main/resources/application-local.yml

# 3) 실행 / 빌드 / 테스트
./gradlew bootRun --args='--spring.profiles.active=local'
./gradlew build
./gradlew test --tests '*ModularityTests'
```

DB 접속 정보는 환경변수로도 넘길 수 있다: `DONWORRY_DB_HOST` / `DONWORRY_DB_PORT` / `DONWORRY_DB_NAME` / `DONWORRY_DB_USER` / `DONWORRY_DB_PASSWORD` / `DONWORRY_PORT`, 외부 연동은 `CAKESHOP_BASE_URL` / `AI_SERVER_BASE_URL`.

`application-local.yml`은 `.gitignore` 대상이다. 비밀값을 `application.yml`에 적지 않는다.

## 기술 스택 결정

| 항목 | 선택 | 비고 |
| --- | --- | --- |
| Java | 17 | Spring Boot 4.x 최소 버전 |
| Spring Boot | 4.1.1 | 2026-10 기준 최신 안정 버전 |
| Spring Modulith | 2.1.1 | 모듈 경계 + Event Publication Registry |
| DB | MariaDB | 드라이버 `mariadb-java-client` |
| 마이그레이션 | Flyway (+ `flyway-mysql`) | 스키마 정본, 수동 변경 금지 |

## 아직 없는 것

- Flyway 마이그레이션 스크립트 (`event_publication` 테이블 포함). 이 때문에 `spring.jpa.hibernate.ddl-auto`는 `none`이며, 마이그레이션이 생기면 `validate`로 올린다.
- `SecurityConfig` — `spring-boot-starter-security`만 들어가 있어 현재는 모든 요청이 인증을 요구한다.
- 25개 테이블의 엔티티, C01~C07 API·이벤트 구현, 업무 테스트.
- `frontend/`, `ai-server/` 디렉터리.
