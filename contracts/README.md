# contracts

서비스 경계를 넘는 계약을 **기계가 읽을 수 있는 형태**로 둔다.

Notion 05는 계약의 설명과 결정 이유를, 여기는 검증에 쓸 수 있는 정의를 담는다.
둘이 어긋나면 양쪽을 같은 PR에서 함께 고친다.

## 무엇이 여기 들어오나

경계를 넘는 것만 둔다. 한 서비스 안에서만 쓰는 DTO는 그 서비스 코드에 둔다.

| 계약 | 방향 | 파일 |
| --- | --- | --- |
| C01 결제 요청 / 결제 조회 | CakeShop → DonWorry PG | [`openapi/donworry-pg.yaml`](openapi/donworry-pg.yaml) |
| C06 최종 결과 통보 | DonWorry PG → CakeShop | [`openapi/cakeshop-callback.yaml`](openapi/cakeshop-callback.yaml) |
| C04 AI 조사보고서 | DonWorry Investigation → AI Server | [`openapi/ai-server.yaml`](openapi/ai-server.yaml) |
| C05 CaseDecisionMade | Investigation → Payment (Spring Modulith Event) | [`events/CaseDecisionMade.schema.json`](events/CaseDecisionMade.schema.json) |

여기 없는 것:

- **C02 / C03** — Spring Boot 안의 Java Interface다. 계약이 곧 Java 타입이므로 코드가 정본이다
  (Notion 05-2). 모듈 경계는 `ModularityTests`가 검사한다.
- **C07 MockCardService** — Payment 모듈 내부 서비스다. 별도 HTTP 서버가 아니다.
- **화면 API** (`/api/security/*`, `/api/merchant/*`, `/api/admin/*`) — React와 백엔드가 같은
  저장소에 있어 타입을 공유한다. 계약 테스트가 필요해지면 그때 추가한다.

## 바꿀 때

1. 같은 PR에서 Notion 05의 해당 절도 고친다.
2. 구현과 테스트를 함께 고친다. 계약만 바꾸고 끝내지 않는다.
3. 영향을 받는 모듈 담당자 리뷰를 받는다 (Notion 06-3).
4. 호출하는 쪽이 다른 팀이면(CakeShop·AI Server) 그 담당자 승인을 받는다.

## 아직 안 된 것

- 계약 파일로 **구현을 검증하는 테스트가 없다.** 지금은 사람이 읽는 정의일 뿐이다.
  스키마 기반 계약 테스트는 구현이 붙은 뒤에 추가한다.
- 응답 예시가 성공 경로 중심이다. 오류 경로(409·422)는 상태 코드와 오류 본문 형태만 적혀 있다.
