-- create_ai_report_steps_table
-- 생성: 2026-10-27 06:57:37 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다


-- P4 investigation/report · 기준: PLAN 10/24 결정 "조사 단계는 새 테이블에 쌓는다", Issue #70 (2-19 ①)

-- AI 조사 과정 한 단계 (증거 조회 Tool 호출 등). 화면 "AI가 조사한 과정"의 재료 — 끝나면 report_body.trace로 요약 복사
-- 원본 증거 · 질문 전문은 넣지 않고 짧은 요약만 둔다. 조사 기록이라 물리 삭제하지 않는다
CREATE TABLE ai_report_steps
(
    step_id     BIGINT       NOT NULL AUTO_INCREMENT,
    report_id   BIGINT       NOT NULL,                -- 같은 P4 ai_reports라 물리 FK
    attempt_id  VARCHAR(36)  NOT NULL,                -- 몇 번째 시도의 단계인지 (UUID)
    step_no     INT          NOT NULL,                -- 보고서 안 순서 (1부터)
    kind        VARCHAR(20)  NOT NULL,                -- TOOL (2-19b: LLM · VALIDATE 추가)
    tool_name   VARCHAR(50)  NULL,                    -- kind = TOOL일 때 창구 이름
    ok          BOOLEAN      NOT NULL,
    summary     VARCHAR(200) NOT NULL,                -- 사람이 읽는 짧은 요약
    started_at  DATETIME(6)  NOT NULL,                -- UTC
    duration_ms INT          NOT NULL,
    PRIMARY KEY (step_id),
    CONSTRAINT fk_ai_report_steps_report FOREIGN KEY (report_id) REFERENCES ai_reports (report_id),
    INDEX idx_ai_report_steps_report (report_id, step_no)
);
