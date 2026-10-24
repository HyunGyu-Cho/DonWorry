-- seed_fds_rules
-- 생성: 2026-10-24 10:20:18 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P2 fds · 기준: 최종 기획+설계서 3 결제 FDS · 4 직원 계정 보호 (개인 저장소 Issue #3)
-- 판정 구간: 차단 목록 일치면 즉시 DENY → 점수 합 0~39 ALLOW / 40~69 REVIEW / 70+ DENY
-- 직원 Rule은 점수 대신 위험도(CAUTION · HIGH)로 경보만 만든다

INSERT INTO fds_rules
    (rule_code, target, display_name, criteria, action, score, severity, threshold, enabled, updated_by, created_at, updated_at)
VALUES
    ('BLOCKLIST', 'PAYMENT', '차단 목록 일치',
     '과거 사기로 판정된 카드 · 기기 · IP · 이메일과 일치', 'DENY', 0, NULL,
     NULL, TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('HIGH_AMOUNT', 'PAYMENT', '고액 결제',
     '결제 금액 50만 원 이상 +20점, 100만 원 이상 +35점', 'SCORE', 20, NULL,
     '{"tiers": [{"minAmount": 500000, "score": 20}, {"minAmount": 1000000, "score": 35}]}', TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('AMOUNT_SPIKE', 'PAYMENT', '평소보다 큰 금액',
     '이 고객의 평균 결제 금액의 5배 이상', 'SCORE', 20, NULL,
     '{"multiplier": 5}', TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('NEW_CARD', 'PAYMENT', '처음 쓰는 카드',
     '이 고객이 이 카드로 결제를 완료한 이력 0건', 'SCORE', 15, NULL,
     NULL, TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('NEW_ACCOUNT', 'PAYMENT', '신규 계정 결제',
     'CakeShop 가입 24시간 이내 계정의 결제', 'SCORE', 20, NULL,
     '{"withinHours": 24}', TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('CARD_TESTING', 'PAYMENT', '카드 테스팅',
     '같은 IP에서 1시간 안에 서로 다른 카드 3장 이상 (이번 결제 포함)', 'SCORE', 45, NULL,
     '{"windowMinutes": 60, "minCards": 3}', TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('DECLINE_RETRY', 'PAYMENT', '거절 후 재시도',
     '같은 카드가 10분 안에 카드사 거절 2회 이상', 'SCORE', 30, NULL,
     '{"windowMinutes": 10, "minDeclines": 2}', TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('GEO_MISMATCH', 'PAYMENT', '해외 · 익명 접속',
     '카드 발급국 ≠ 접속 국가, 또는 VPN · Tor 같은 익명 IP', 'SCORE', 25, NULL,
     NULL, TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('STAFF_LOGIN_FAIL', 'STAFF', '로그인 · OTP 실패 반복',
     '계정당 10분 안 비밀번호 또는 OTP 실패 3회 이상', 'ALERT', 0, 'CAUTION',
     '{"windowMinutes": 10, "minFailures": 3}', TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('STAFF_NEW_DEVICE', 'STAFF', '사내망 밖 · 새 기기 접속',
     '등록된 사내 IP · 업무 PC가 아닌 곳에서 로그인 또는 세션 사용', 'ALERT', 0, 'CAUTION',
     NULL, TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('CONCURRENT_SESSION', 'STAFF', '세션 동시 사용',
     '같은 세션이 서로 다른 IP · 기기에서 동시에 사용됨', 'ALERT', 0, 'HIGH',
     NULL, TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('DECISION_ANOMALY', 'STAFF', '판정 이상',
     '30분 안에 AI 권고와 반대로 매입 허용 3건 이상 시도, 또는 재인증 실패', 'ALERT', 0, 'HIGH',
     '{"windowMinutes": 30, "minOverrides": 3}', TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('CONFIG_WEAKEN', 'STAFF', '탐지 설정 완화',
     'Rule 끄기 · 기준값 완화 · 허용 목록 추가 요청', 'ALERT', 0, 'CAUTION',
     NULL, TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('STAFF_DISTRIBUTED', 'STAFF', '분산 로그인 실패',
     '한 계정에 10분 안 서로 다른 IP 5개 이상에서 로그인 실패', 'ALERT', 0, 'HIGH',
     '{"windowMinutes": 10, "minIps": 5}', TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('PASSWORD_SPRAY', 'STAFF', '비밀번호 뿌리기',
     '한 IP가 10분 안에 직원 계정 2개 이상에 로그인 시도', 'ALERT', 0, 'HIGH',
     '{"windowMinutes": 10, "minAccounts": 2}', TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6));
