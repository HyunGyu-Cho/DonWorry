-- create_staff_devices_table
-- 생성: 2026-10-24 10:20:05 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P1 identity · 기준: 최종 기획+설계서 목표 ERD (개인 저장소 Issue #3)

-- 직원별 등록 기기 (업무 PC). 사내망 밖 · 새 기기 Rule의 기준
CREATE TABLE staff_devices
(
    staff_device_id BIGINT       NOT NULL AUTO_INCREMENT,
    user_id         BIGINT       NOT NULL,
    device_id       VARCHAR(100) NOT NULL,                    -- 브라우저가 보낸 기기 ID
    label           VARCHAR(100) NULL,                        -- 예: 업무 PC · Chrome · Windows
    first_seen_at   DATETIME(6)  NOT NULL,                    -- UTC
    trusted_at      DATETIME(6)  NULL,                        -- 등록(신뢰) 전이면 NULL
    revoked_at      DATETIME(6)  NULL,
    PRIMARY KEY (staff_device_id),
    CONSTRAINT uk_staff_devices_user_device UNIQUE (user_id, device_id),
    CONSTRAINT fk_staff_devices_user FOREIGN KEY (user_id) REFERENCES platform_users (user_id)
);
