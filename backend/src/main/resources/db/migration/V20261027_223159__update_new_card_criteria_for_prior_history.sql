-- update_new_card_criteria_for_prior_history
-- 생성: 2026-10-27 22:31:59 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다


-- P2 fds · 개인 저장소 Issue #98 (F-4, ADR-0023)
-- R03은 과거 정상 결제(같은 가맹점 · 같은 구매자의 매입 완료)가 있는 구매자만 판단한다. 첫 손님은 비교 이력 부족으로 확인 불가
UPDATE fds_rules
SET criteria   = '과거 정상 결제가 있는 구매자가 그동안 결제를 완료한 적 없는 카드로 결제',
    updated_at = UTC_TIMESTAMP(6)
WHERE rule_code = 'NEW_CARD';
