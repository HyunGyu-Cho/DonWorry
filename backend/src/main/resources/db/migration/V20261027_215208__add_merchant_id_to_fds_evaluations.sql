-- add_merchant_id_to_fds_evaluations
-- 생성: 2026-10-27 21:52:08 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다


-- P2 fds · 개인 저장소 Issue #96 (F-3 평가 입력 넓히기, ADR-0023)
-- 룰 · 차단 목록은 고객사 공통이지만 이력 비교는 가맹점 + 구매자 단위라, 평가 당시 가맹점을 남긴다
-- P5 payments 논리 참조 (FK 없음). 가맹점 없이 만든 개발용 Mock 평가는 NULL
ALTER TABLE fds_evaluations
    ADD COLUMN merchant_id BIGINT NULL AFTER payment_id;

UPDATE fds_evaluations evaluation
JOIN payments payment ON payment.payment_id = evaluation.payment_id
SET evaluation.merchant_id = payment.merchant_id;
