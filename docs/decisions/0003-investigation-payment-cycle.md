# 0003. investigation ↔ payment 순환 의존 해소

- **상태:** 제안 — 결정 안 됨
- **날짜:** 2026-10-20
- **관련:** Notion 02-1 §4, 05-2, 03-2(SEC-02), DEC-06
- **결정 필요한 사람:** 시은(payment), 수민(investigation)

## 배경

문서 두 곳이 서로 반대 방향의 Java 의존을 허용한다.

- **Notion 02-1 §4**: `payment → investigation.api` (Java Interface). HELD 저장 후 Case 연결(C03).
  같은 절에서 "investigation ⇢ payment 는 Spring Event 이며 **역방향 Java 직접 의존이 아니다**"라고 적는다.
- **Notion 05-2 공개 조회 Interface**: "Investigation: PaymentReader/FdsReader/IdentityAccessReader 조회".
  즉 `investigation → payment.api`.

둘을 다 지키면 `payment → investigation → payment` 순환이 된다.

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

`ApplicationModules.verify()` 가 실패한다. CI 의 `backend / check` 잡이 막히므로 **구현 첫날
부딪힌다.** 실험 클래스는 확인 후 제거했고 현재 저장소는 통과 상태다.

## 왜 지금 결정해야 하나

지금은 두 모듈이 비어 있어 어느 쪽으로 가도 비용이 같다. 엔티티와 서비스가 붙은 뒤에
바꾸면 SEC-02 합성 응답과 C03 계약을 동시에 고쳐야 한다.

## 선택지

| 안 | 내용 | 영향 |
| --- | --- | --- |
| **A. investigation 이 PaymentReader 를 쓰지 않는다** | C03 `CaseLinkRequest` 가 필요한 결제 사실(금액·상태)을 함께 넘기고 `case_payments` 에 스냅샷으로 둔다. SEC-02 는 스냅샷을 보여준다 | 05-2 의 "Investigation → PaymentReader 조회" 문장을 지운다. 연결 이후 결제 상태 변화(HELD→REJECTED)를 어떻게 반영할지 정해야 한다 — 이벤트로 갱신하거나 화면에서 별도 조회 |
| **B. payment 가 investigation.api 를 직접 부르지 않는다** | HELD 커밋 후 이벤트를 발행하고 investigation 이 수신해 Case 를 연결한 뒤 결과를 이벤트로 돌려준다 | DEC-06 이 "커밋 후 Investigation Java API 호출"로 못박았으므로 DEC-06 을 고쳐야 한다. `case_link_status` 재시도 흐름도 비동기로 다시 설계 |
| **C. SEC-02 합성 응답을 화면에서 조립** | investigation 은 Case·Alert·판정만 주고, 결제 정보는 프론트가 payment 엔드포인트에서 따로 받아 합친다 | 03-2 의 "상세 합성 응답" 1개 호출 전제가 깨진다. 02-2 의 "API 호출은 api/ 단일 위치" 는 지켜진다 |
| **D. 순환을 허용하고 검사를 끈다** | — | 02-1 이 "순환 의존을 피한다"고 명시했고 06-3 이 Modulith verify 를 필수 CI 로 넣었다. 둘을 동시에 버리는 선택 |

## 권고

**A.** 이유:

- DEC-06(HELD 커밋 → Java API 호출 → `case_link_status` 재시도)을 건드리지 않는다.
  10/23 시연의 핵심 경로이고 재시도·복구 요구가 가장 촘촘한 부분이다.
- C03 요청은 이미 `riskScore`, `occurredAt` 같은 payment 쪽 사실을 넘긴다. 금액·상태를
  추가하는 것은 계약의 성격을 바꾸지 않는다.
- 모듈 5개를 유지한다. B·C 보다 고칠 문서가 적다(05-2 한 문장).

남는 질문: 연결 이후 결제 상태 변화를 SEC-02 에 어떻게 비출지. 1차 MVP 범위에서는
직원 판정 전까지 HELD 가 유지되므로 스냅샷으로 충분할 수 있다. 확인 필요.

## 영향 (A 를 고를 경우)

- **API:** C03 `CaseLinkRequest` 에 결제 금액·상태 추가. 05-2 의 PaymentReader 조회 주체에서
  Investigation 제거.
- **DB:** `case_payments` 에 스냅샷 컬럼 추가 — 새 Flyway 버전.
- **화면:** SEC-02 "연결된 결제" 영역의 데이터 출처가 스냅샷으로 바뀐다.
- **테스트:** `ModularityTests` 가 통과 상태를 유지한다.
- **문서:** Notion 02-1 §4, 05-2, 04-2, DEC-01.

## 검증

선택지를 고른 뒤 두 모듈에 실제 호출을 넣고 `./gradlew check` 로 순환이 없음을 확인한다.
현재는 **미검증** — 아직 결정되지 않았다.
