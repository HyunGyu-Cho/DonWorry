# 아키텍처 결정 기록 (ADR)

중대한 결정의 **이유·대안·영향**을 남긴다. Notion은 합의 내용을, 여기는 "왜 그것을 골랐고
무엇을 버렸는지"를 담는다.

## 언제 쓰나

쓴다:

- 모듈 경계·의존 방향 변경
- 저장 방식·스키마 전략 변경
- 외부 계약(HTTP·Event) 변경
- 기술·라이브러리 선택과 그 교체
- Notion 04-3의 DEC를 뒤집는 변경 (DEC ID를 본문에 적는다)

안 쓴다:

- 변수명·파일 배치 같은 구현 선택
- Notion에 이미 적힌 결정을 그대로 반복하는 것

## 규칙

- 파일명 `NNNN-짧은-제목.md`, 번호는 4자리 연번.
- 한 파일에 한 결정.
- **채택된 ADR의 본문은 고치지 않는다.** 뒤집을 때는 새 ADR을 쓰고 이전 것의 상태를
  `대체됨 (→ NNNN)`으로만 바꾼다.
- 영향 범위(API·DB·화면·테스트)를 적고, 그 범위를 같은 PR에서 함께 고친다.
- 템플릿: [`0000-template.md`](0000-template.md)

## 목록

| 번호 | 제목 | 상태 |
| --- | --- | --- |
| [0001](0001-modulith-event-registry-jdbc.md) | Modulith 이벤트 레지스트리를 JDBC 구현으로 | 채택 |
| [0002](0002-typescript-5-9-for-eslint.md) | Frontend TypeScript를 5.9로 고정 | 채택 |
| [0003](0003-investigation-payment-cycle.md) | investigation ↔ payment 순환 의존 해소 | **제안 — 결정 필요** |
