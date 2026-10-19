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
│   ├── gradle/                      # Gradle Wrapper (`gradle wrapper` 실행 시 생성)
│   └── src/
│       ├── main/
│       │   ├── java/com/donworry/
│       │   │   ├── identity/        # 로그인·사용자·가맹점·권한
│       │   │   ├── payment/         # PG·결제·CakeShop 연동·Mock 카드사
│       │   │   ├── fds/             # Rule Engine·위험평가·Alert
│       │   │   ├── investigation/   # Case·보안직원 판정·AI 결과 관리
│       │   │   └── settlement/      # 매입·정산·환불·자금관리(cashflow)
│       │   └── resources/
│       │       └── db/migration/    # Flyway 마이그레이션 (스키마 수동 변경 금지)
│       └── test/
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

## 아직 없는 것

Gradle 빌드 스크립트, 애플리케이션 설정, Flyway 마이그레이션, 엔티티·API 구현, 테스트가 모두 미작성 상태다. 현재 저장소에 있는 것은 모듈 경계와 상위 폴더 구조뿐이다.
