# 0003. investigation ↔ payment 순환 의존 해소

- **상태:** 채택
- **날짜:** 2026-10-20
- **관련:** Notion 02-1 §4, 05-2, 03-2(SEC-02), 04-2, DEC-01, DEC-06
- **영향 받는 담당:** 시은(payment), 수민(investigation)

## 배경

문서 두 곳이 서로 반대 방향의 Java 의존을 허용한다.

- **Notion 02-1 §4**: `payment → investigation.api` (Java Interface). HELD 저장 후 Case 연결(C03).
  같은 절에서 "investigation ⇢ payment 는 Spring Event 이며 **역방향 Java 직접 의존이 아니다**"라고 적는다.
- **Notion 05-2 공개 조회 Interface**: "Investigation: PaymentReader/FdsReader/IdentityAccessReader 조회".
  즉 `investigation → payment.api`.

두 문서는 각각 일관되지만 합치면 모순이다. 둘을 다 지키면 `payment → investigation → payment`
순환이 된다. Modulith 는 클래스가 아니라 **모듈 단위로** 의존을 집계하므로, `CaseLinker` 와
`PaymentReader` 가 서로 무관한 타입이어도 모듈 간선 두 개가 되어 순환으로 집계된다.

### 실제로 확인한 결과

두 방향을 각각 쓰는 최소 클래스를 만들어 `ModularityTests` 를 돌렸다.

```
org.springframework.modulith.core.Violations:
- Cycle detected: Slice investigation -> Slice payment -> Slice investigation
  1. Dependencies of Slice investigation
    - Constructor <com.donworry.investigation.service.CaseServiceProbe.<init>(
        com.donworry.payment.api.PaymentReader)> has parameter of type
        <com.donworry.payment.api.PaymentReader>
```

`ApplicationModules.verify()` 가 실패한다. CI 의 `backend / check` 잡이 막히므로 구현 첫날
부딪힌다. 두 모듈이 비어 있는 지금이 가장 싸게 고칠 시점이었다.

`settlement → payment.api` 도 같은 조회 계약을 쓰지만 payment 가 settlement 를 참조하지
않으므로 순환이 아니다. 문제는 investigation 뿐이다.

## 결정

**investigation 은 payment 에 Java 로 의존하지 않는다.**

- `investigation` 패키지의 어떤 클래스도 `com.donworry.payment..` 를 import 하지 않는다.
  `PaymentReader` 조회 주체에서 Investigation 을 뺀다.
- C03 `CaseLinkRequest` 가 SEC-01·02 화면에 필요한 결제 사실을 함께 넘기고,
  investigation 이 `case_payments` 에 **연결 시점 스냅샷**으로 보관한다.
- 화면에 보이는 "연결 시점 결제 상태"는 스냅샷이다. 그 이후의 최종 상태는
  `case_decisions` 의 판정 이력으로 드러난다. 1차 MVP 범위에서는 직원 판정 전까지
  결제가 HELD 로 유지되므로 스냅샷과 판정 이력으로 SEC-02 가 성립한다.
- `payment → investigation.api` 방향(C03 호출, `CaseDecisionMade` 이벤트 타입 수신)은 그대로 둔다.

## 고려한 대안

| 안 | 내용 | 버린 이유 |
| --- | --- | --- |
| **A (채택)** | investigation 이 PaymentReader 를 쓰지 않고 C03 요청의 스냅샷을 쓴다 | — |
| B | payment 가 investigation.api 를 직접 부르지 않고 이벤트로 Case 연결을 요청한다 | DEC-06 이 "커밋 후 Investigation Java API 호출"로 못박았다. `case_link_status` 재시도·복구 흐름을 비동기로 다시 설계해야 하는데, 10/23 시연의 핵심 경로이고 요구가 가장 촘촘한 부분이다 |
| C | SEC-02 합성 응답을 프론트에서 조립 | 03-2 의 "상세 합성 응답" 1개 호출 전제가 깨진다. 화면 쪽 왕복이 늘어난다 |
| D | 순환을 허용하고 검사를 끈다 | 02-1 이 "순환 의존을 피한다"고 명시했고 06-3 이 Modulith verify 를 필수 CI 로 넣었다. 둘을 동시에 버리는 선택 |

### 상태 변화를 이벤트로 받는 방안을 쓰지 않은 이유

payment 가 상태 변경 이벤트를 발행하고 investigation 이 수신하려면 investigation 이 그 이벤트
타입을 import 해야 한다. 이벤트 타입이 `payment.api` 에 있으면 `investigation → payment` 가
되어 순환이 다시 생긴다. 중립 모듈을 두는 것은 02-1 의 "업무 모듈 5개 유지"에 어긋난다.

## 영향

- **API:** C03 `CaseLinkRequest` 에 `orderId`, `amount`, `paymentStatus` 추가. Notion 05-2 의
  PaymentReader 조회 주체에서 Investigation 제거.
- **DB:** `V7__case_payments_payment_snapshot.sql` — `case_payments` 에 스냅샷 3개 컬럼 추가.
  `V4` 는 이미 푸시되었으므로 수정하지 않고 새 버전을 더했다 (06-3).
- **화면:** SEC-02 "연결된 결제" 영역의 출처가 스냅샷이다. 표시 문구에 연결 시점임을 드러낸다.
- **테스트:** `ArchitectureTests.investigation_은_payment_에_의존하지_않는다()` 가 이 결정을
  강제한다. 누가 `PaymentReader` 를 다시 끌어오면 `./gradlew check` 에서 막힌다.
  `SchemaMigrationTests` 가 스냅샷 컬럼 존재를 확인한다.
- **문서:** `AGENTS.md`, README 모듈 경계 규칙, `investigation/api`·`payment/api` package-info.
  Notion 도 갱신했다 (2026-10-20):
  - **02-1 §4** `investigation ⇢ payment` 항목에 PaymentReader 조회 금지와 그 이유, 스냅샷 방식,
    이 ADR 링크를 추가. `payment → investigation.api` 항목에 요청이 결제 사실을 함께 넘긴다는 점 추가.
  - **05-2** C03 Request 에 `orderId`, `amount`, `paymentStatus` 추가. 공개 조회 Interface 의
    Investigation 항목에서 PaymentReader 제거.

  **남은 것:** 02-1 하단의 "전체 시스템 및 업무 호출 관계", "Java 모듈 의존성: 핵심 구조"
  두 이미지가 이전 의존 방향을 그렸을 수 있다. 이미지는 고치지 못했으므로 다음에 다시 그릴 때
  investigation → payment 화살표를 빼야 한다. 같은 페이지의 `CaseService` 코드 예시는 이미
  `ApplicationEventPublisher` 만 들고 있어 이 결정과 맞다.

## 검증

`./gradlew check` 통과(테스트 6건) — ArchUnit 규칙이 추가된 상태.
임시 MariaDB 에서 `./gradlew dbTest` 통과, `case_payments` 스냅샷 컬럼 3개 확인.

**미검증:** 실제 C03 구현이 이 계약으로 동작하는지. 아직 코드가 없다.
