-- create_case_staff_hits_table
-- 생성: 2026-10-24 10:20:11 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P3 investigation · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)

-- 직원 사건에 묶인 직원 경보 (결제 사건의 case_payments에 해당)
CREATE TABLE case_staff_hits
(
    case_staff_hit_id BIGINT      NOT NULL AUTO_INCREMENT,
    case_id           BIGINT      NOT NULL,
    staff_hit_id      BIGINT      NOT NULL,                   -- P2 staff_rule_hits 논리 참조 (FK 없음)
    linked_at         DATETIME(6) NOT NULL,                   -- UTC
    PRIMARY KEY (case_staff_hit_id),
    CONSTRAINT uk_case_staff_hits_hit UNIQUE (staff_hit_id),  -- 경보 1건은 사건 1개에만
    CONSTRAINT fk_case_staff_hits_case FOREIGN KEY (case_id) REFERENCES security_cases (case_id)
);
