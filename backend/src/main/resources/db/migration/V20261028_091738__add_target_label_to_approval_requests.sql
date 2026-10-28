-- add_target_label_to_approval_requests
-- 생성: 2026-10-28 09:17:38 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다


-- 승인함에 보일 대상 이름 (#102) — 예: "차단 목록 IP · VPN 대역", "사건 201 · 단체 행사용 케이크 세트"
-- 대상 ID만으로는 다른 담당 테이블을 읽어야 이름을 알 수 있어, 요청할 때의 이름을 남긴다. 이전 행은 NULL
ALTER TABLE approval_requests
    ADD COLUMN target_label VARCHAR(200) NULL AFTER target_id;
