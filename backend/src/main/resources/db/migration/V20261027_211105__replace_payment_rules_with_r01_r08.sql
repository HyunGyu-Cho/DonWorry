-- replace_payment_rules_with_r01_r08
-- 생성: 2026-10-27 21:11:05 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다


-- P2 fds · 개인 저장소 Issue #96 (F-1, ADR-0023) · 기준: 신규 8개 룰 및 차단 시나리오 제안안
-- 판정 구간: 차단 목록 일치면 즉시 DENY → 점수 합 0~49 ALLOW / 50~79 REVIEW / 80+ DENY (표시 점수 최대 100)
-- 기존 행은 지우지 않는다 — 과거 평가(fds_rule_hits)가 rule_code로 가리킨다
-- 계산은 묶음 ② · ③에서 Rule마다 붙인다. 그전까지 계산하지 않는 Rule은 기록 없이 0점

-- R01 고액 결제: 금액 구간별 20 · 35점 → 50만 원 이상 30점 하나
UPDATE fds_rules
SET display_code = 'R01',
    display_name = '고액 결제',
    criteria     = '결제 금액 50만 원 이상',
    score        = 30,
    threshold    = '{"minAmount": 500000}',
    updated_at   = UTC_TIMESTAMP(6)
WHERE rule_code = 'HIGH_AMOUNT';

-- R03 기존 결제 이력 없는 카드: 15 → 25점 (과거 정상 결제가 있는 구매자만 보는 조건은 F-4)
UPDATE fds_rules
SET display_code = 'R03',
    display_name = '기존 결제 이력 없는 카드',
    criteria     = '이 구매자가 이 카드로 결제를 완료한 이력 0건',
    score        = 25,
    updated_at   = UTC_TIMESTAMP(6)
WHERE rule_code = 'NEW_CARD';

-- R06 카드 테스팅: 기준 · 점수 그대로
UPDATE fds_rules
SET display_code = 'R06',
    updated_at   = UTC_TIMESTAMP(6)
WHERE rule_code = 'CARD_TESTING';

-- R07 차단 목록 일치: 점수 계산 없이 DENY (화면 표시는 100점)
UPDATE fds_rules
SET display_code = 'R07',
    score        = 100,
    updated_at   = UTC_TIMESTAMP(6)
WHERE rule_code = 'BLOCKLIST';

-- R08 거절 후 재시도: 30 → 35점
UPDATE fds_rules
SET display_code = 'R08',
    score        = 35,
    updated_at   = UTC_TIMESTAMP(6)
WHERE rule_code = 'DECLINE_RETRY';

-- 새 룰안에 없는 3개는 폐지 (평소보다 큰 금액 · 신규 계정 결제 · 해외 · 익명 접속)
UPDATE fds_rules
SET enabled    = FALSE,
    retired_at = UTC_TIMESTAMP(6),
    updated_at = UTC_TIMESTAMP(6)
WHERE rule_code IN ('AMOUNT_SPIKE', 'NEW_ACCOUNT', 'GEO_MISMATCH');

-- R02 · R04 · R05 추가. R05 고위험 국가 목록은 F-6에서 채운다
INSERT INTO fds_rules
    (rule_code, display_code, target, display_name, criteria, action, score, severity, threshold, enabled, updated_by, created_at, updated_at)
VALUES
    ('NEW_DEVICE', 'R02', 'PAYMENT', '기존 미사용 단말기',
     '과거 정상 결제가 있는 구매자가 그동안 쓰지 않던 기기로 결제', 'SCORE', 25, NULL,
     NULL, TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('RAPID_REPEAT', 'R04', 'PAYMENT', '특정 횟수 이상 결제',
     '같은 가맹점 · 같은 구매자가 10분 안에 결제 3번 이상 시도 (이번 결제 포함)', 'SCORE', 30, NULL,
     '{"windowMinutes": 10, "minAttempts": 3}', TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    ('HIGH_RISK_COUNTRY_IP', 'R05', 'PAYMENT', '고위험 국가 IP',
     '접속 IP의 국가가 고위험 국가 목록에 해당', 'SCORE', 40, NULL,
     '{"countries": []}', TRUE, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6));
