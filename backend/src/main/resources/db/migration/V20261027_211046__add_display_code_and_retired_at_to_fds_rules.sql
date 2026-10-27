-- add_display_code_and_retired_at_to_fds_rules
-- 생성: 2026-10-27 21:10:46 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다


-- P2 fds · 개인 저장소 Issue #96 (F-1 룰 카탈로그 교체, ADR-0023)
-- display_code: 화면 · AI 보고서 · 경보가 같이 쓰는 결제 Rule 표시 번호 (R01~R08). 직원 Rule · 폐지 Rule은 NULL
-- retired_at: 폐지 시각. 폐지 Rule은 평가 · 카탈로그에서 빠지고 다시 켤 수 없다 (enabled는 직원이 끄고 켜는 값이라 따로 둔다)
ALTER TABLE fds_rules
    ADD COLUMN display_code VARCHAR(10) NULL AFTER rule_code,
    ADD COLUMN retired_at   DATETIME(6) NULL AFTER enabled,   -- UTC
    ADD CONSTRAINT uk_fds_rules_display_code UNIQUE (display_code);
