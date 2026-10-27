-- add_display_value_to_blocklist_entries
-- 생성: 2026-10-27 23:55:08 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다


-- P2 fds · 개인 저장소 Issue #100 (F-10, ADR-0023)
-- 화면에 보일 차단 값. 카드는 entry_value에 카드 지문(같은 카드인지 알아보는 값)을 두고 화면에는 끝자리(**** 1173)만 보인다
-- 기기 · IP · 이메일은 entry_value와 같거나 NULL
ALTER TABLE blocklist_entries
    ADD COLUMN display_value VARCHAR(254) NULL AFTER entry_value;
