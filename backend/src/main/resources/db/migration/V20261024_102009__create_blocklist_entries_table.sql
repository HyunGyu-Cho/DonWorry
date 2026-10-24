-- create_blocklist_entries_table
-- 생성: 2026-10-24 10:20:09 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P2 fds · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)

-- 차단 목록. 일치하면 점수 계산 없이 DENY. 해제해도 행은 지우지 않는다
CREATE TABLE blocklist_entries
(
    entry_id    BIGINT       NOT NULL AUTO_INCREMENT,
    entry_type  VARCHAR(20)  NOT NULL,                        -- CARD / IP / EMAIL / DEVICE
    entry_value VARCHAR(254) NOT NULL,                        -- CARD는 카드번호 해시
    reason      VARCHAR(500) NOT NULL,
    source      VARCHAR(20)  NOT NULL,                        -- STAFF(직접 등록) / CASE(사건 판정)
    source_ref  BIGINT       NULL,                            -- source=CASE면 case_id (P3 논리 참조)
    created_by  BIGINT       NULL,                            -- P1 platform_users 논리 참조, 시스템이면 NULL
    created_at  DATETIME(6)  NOT NULL,                        -- UTC
    expires_at  DATETIME(6)  NULL,                            -- 영구면 NULL
    released_at DATETIME(6)  NULL,
    released_by BIGINT       NULL,
    PRIMARY KEY (entry_id)
);

-- 결제 평가 때 값으로 조회
CREATE INDEX idx_blocklist_entries_type_value ON blocklist_entries (entry_type, entry_value);
