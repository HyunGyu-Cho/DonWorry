-- add_raw_score_to_fds_evaluations
-- 생성: 2026-10-27 21:10:57 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다


-- P2 fds · 개인 저장소 Issue #96 (F-1, ADR-0023)
-- raw_score: 적용한 Rule 점수의 합 (100을 넘을 수 있다). risk_score는 화면에 보이는 min(100, raw_score)
-- 기존 평가는 합계가 100을 넘은 적이 없어 risk_score를 그대로 옮긴다. ERROR 평가는 둘 다 NULL
ALTER TABLE fds_evaluations
    ADD COLUMN raw_score INT NULL AFTER risk_score;

UPDATE fds_evaluations
SET raw_score = risk_score
WHERE risk_score IS NOT NULL;
