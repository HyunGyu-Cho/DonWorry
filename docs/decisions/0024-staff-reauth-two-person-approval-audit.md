# 0024. 직원 재인증 · 관리자 승인 · 감사 로그 (1차 MVP는 비밀번호만)

- **상태:** 제안
- **날짜:** 2026-10-28
- **관련:** 개인 저장소 Issue #102 (B 2-1 · 2-10), ADR-0014 (세션 인증), ADR-0019 (Case 판정 HTTP 계약)
- **영향 받는 담당:** P1 identity (로그인 기록 · 잠금 · 재인증), P3 investigation (판정 · 승인 · 감사 로그), 화면 (로그인 · 판정 · 승인함 · 감사 로그)

## 배경

- 보안 직원 한 명이 AI 권고와 반대로 사기 의심 결제를 "매입 허용"하면 돈이 바로 나간다. 지금은 아무 확인 없이 반영되고, 판정자는 요청 본문의 `staffId`라 남의 이름으로도 판정할 수 있다.
- 화면(Mock)에는 OTP 로그인 · OTP 재인증 · 승인함 · 감사 로그가 이미 있지만 백엔드는 비어 있다.
- 실제 OTP(TOTP)를 하려면 비밀키 암호화 · 등록(QR) 화면 · 복구 코드가 함께 필요해 1차 MVP 범위를 넘는다 (현규 결정, 10/28).

## 결정

- **로그인은 비밀번호만 (1차 MVP).** OTP · 복구 코드 · 사장님 새 기기 이메일 확인은 2차(H단계 직원 계정 보호)로 미룬다. 화면의 OTP 단계 코드는 지우지 않고 Mock에서 꺼 둔다 (`setMockSecondFactor`)
- **연속 실패 잠금.** 비밀번호 5번 연속 실패 → `platform_users.locked_until` 30분. 잠긴 동안은 맞는 비밀번호도 `AUTH_011`(423). 잠그면 실패 횟수를 0으로 → 풀린 뒤 다시 5번. 성공하면 0. 해제 화면은 H단계
- **로그인 기록.** 모든 시도를 `staff_login_events`에 남긴다 (SUCCESS · BAD_PASSWORD · LOCKED · UNKNOWN_USER, IP · User-Agent). 없는 아이디도 남긴다 (분산 대입 흔적)
- **재인증 = 비밀번호 다시 입력.** `POST /api/identity/reauth {password}` → 5분 · 1회용 표. 표는 그 직원의 서버 세션에만 두고, 확인하는 순간 지운다 → 다른 직원 세션 · 다른 직원 번호로는 통과하지 않는다. 틀리면 `AUTH_010`(400, 401이면 화면이 로그아웃시킴). 다른 모듈은 `identity.api.Reauthentication.consume(token)`으로만 확인한다
- **판정자 = 로그인 직원.** 판정 API는 `CurrentUser`의 보안 직원 · 보안 관리자만 받고(`INV_021` · `INV_011`), 본문 `staffId`는 무시한다
- **권고 반대 판정 → 관리자 승인.** AI 권고가 `REJECT_REVIEW`(승인 취소 검토)인 결제를 `ACCEPT`(매입 허용)로 고르면 권고 반대 (화면 DecisionPanel과 같은 기준). 하나라도 있으면 묶음 전체를 바로 반영하지 않고:
  - 재인증 표가 없거나 틀리면 `INV_017`, 아무것도 저장하지 않음
  - 표가 맞으면 `DECISION_OVERRIDE` 승인 요청(대상 = 첫 권고 반대 `case_payment_id`, payload = 사건 · 증거 버전 · 보고서 · 판정 묶음 전체)을 만들고 사건은 `APPROVAL_PENDING`, 응답은 `{outcome: "APPROVAL_PENDING", approvalId}`
  - 승인되면 같은 트랜잭션에서 요청한 직원 이름으로 판정 · 인계를 저장, 거절되면 사건은 판정 대기로. 요청 뒤 사건에 결제가 붙었으면(증거 버전 변경) 승인이 `INV_003`으로 실패 → 거절해야 한다
  - 승인 대기 중 사건은 다른 판정을 받지 않고(`INV_013`), 새 결제를 묶지 않는다 (병합 대상 상태가 아님)
- **관리자 승인 규칙.** 보안 관리자만 처리(`INV_016`), 본인 요청 승인 불가(`INV_010`, DB CHECK로도 막음), 이미 처리됐거나 24시간 지난 요청 불가(`INV_012`, 기한 지난 대기 요청은 목록에 `EXPIRED`로 보임), 거절은 이유 필수(`INV_015`), 같은 대상에 대기 요청 하나만(`INV_013`). 화면이 직접 만들 수 있는 요청은 Rule 끄기 · 기준값 · 차단 해제뿐이고, 승인 뒤 실제 반영(Rule 끄기 · 차단 해제)은 [ADR-0025](0025-rule-toggle-blocklist-release-similar-cases.md)
- **승인 대상 이름.** `approval_requests.target_label` 칸 추가 — 다른 담당 테이블을 읽지 않고 승인함에 이름을 보이게
- **감사 로그.** `audit_logs`에 업무 저장과 같은 트랜잭션으로 남긴다: `APPROVAL_REQUESTED` · `APPROVAL_APPROVED` · `APPROVAL_REJECTED` · `DECISION_CONFIRMED` · `BLOCKLIST_ADDED`. 직원 로그인(`LOGIN_SUCCESS` · `LOGIN_FAILED` · `ACCOUNT_LOCKED` · `LOGIN_WHILE_LOCKED`)은 identity가 `StaffLoginRecorded` 이벤트를 내고 investigation이 커밋 뒤 받아 저장한다 (identity는 다른 모듈에 의존하지 않음). 조회 `GET /api/investigation/audit-logs`는 보안 관리자만(`INV_024`), 최신 200줄

## 고려한 대안

| 대안 | 버린 이유 |
| --- | --- |
| 이번에 실제 TOTP · 등록 화면 · 복구 코드까지 | 비밀키 암호화 · QR 등록 · 복구 코드 관리까지 묶음이 1.5배. 1차 시연에는 재인증 · 관리자 승인 장면이 핵심 |
| 시연 고정 OTP 코드(246810)를 실제 서버에서 받기 | 설정 하나로 운영에서 누구나 통과하는 뒷문이 됨. OTP를 빼면 필요 없음 |
| 재인증 표를 DB에 저장 | 5분짜리 1회용이라 세션이 끝나면 의미가 없음. 세션에 두면 다른 직원 세션에서 쓸 수 없다는 규칙이 저절로 지켜짐 |
| 재인증 실패도 로그인 실패 횟수에 넣기 | 로그인한 직원을 위험한 조치 중에 잠가 버림. 세션 탈취 대응은 H단계 세션 감시에서 |
| 권고 반대 결제만 승인 대기, 나머지는 바로 반영 | 한 사건 판정이 둘로 나뉘어 직원 · 관리자가 따로 읽어야 함. 화면 Mock도 묶음 전체를 기다림 |
| 승인 · 판정 서비스가 서로 직접 호출 | 순환 의존. 승인 결과는 같은 트랜잭션 안 이벤트(`OverrideDecided`)로 판정 서비스에 넘김 |
| identity가 감사 로그 테이블에 직접 쓰기 | identity는 의존 없음(ADR-0012 허용 목록). 이벤트로 넘김 |
| 감사 로그를 커밋 뒤 비동기로만 | 업무는 저장됐는데 감사 로그가 빠질 수 있음. 같은 모듈 안 행동은 같은 트랜잭션 |

## 영향

- API (새로): `POST /api/identity/reauth`, `POST /api/investigation/approvals`, `POST /api/investigation/approvals/{id}/decision`, `GET /api/investigation/audit-logs`
- API (바뀜): `POST /api/auth/login` 잠금이면 423 `AUTH_011`. `POST /api/security-cases/{id}/decisions` 로그인 필수 · `reauthToken` 추가 · 권고 반대면 `{outcome, approvalId}` 응답 · `staffId` 무시. 화면 계약 `reauth({code})` → `reauth({password})`
- 오류 코드: `AUTH_010` · `AUTH_011`, `INV_010` · `011` · `012` · `013` · `015` · `016` · `017` · `021` · `022` · `023` · `024`
- DB: `approval_requests.target_label` (`V20261028_091738`). 기존 `staff_login_events` · `audit_logs` · `platform_users` 잠금 칸을 처음 씀. `security_cases.status`에 `APPROVAL_PENDING` 값
- 모듈 계약: `identity.api.Reauthentication` · `StaffLoginRecorded` 추가
- 화면: Mock 로그인 OTP · 이메일 확인 단계 끔, 판정 재인증 창을 비밀번호 입력으로, 감사 로그 동작 이름 추가
- 테스트: 로그인 잠금 · 기록, 재인증 표, 판정 · 권고 반대 · 승인 · 거절, 승인 규칙 · 만료, 감사 로그 (MariaDB). 기존 판정 테스트는 로그인 직원을 넣도록 준비만 바꿈

## 검증

- `cd backend && ./gradlew check mariaDbTest` · `cd frontend && npm run lint && npm run format:check && npm run build && npm test` · Playwright e2e — 결과는 PR #102 본문
