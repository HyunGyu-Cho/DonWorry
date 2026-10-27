-- set_high_risk_countries_for_demo
-- 생성: 2026-10-27 22:49:34 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다


-- P2 fds · 개인 저장소 Issue #98 (F-6, ADR-0023)
-- R05 고위험 국가 목록 — 시연 IP 이름표(demo_fake_ips)의 해외 나라에서 고른 시연용 값이다. 실제 위험 국가 목록이 아니다
-- 운영에서 쓸 목록은 이 기준값만 바꾼다 (끄기 · 완화는 관리자 승인 대상)
UPDATE fds_rules
SET criteria   = '접속 IP의 국가가 고위험 국가 목록(시연용: 러시아 · 베트남 · 네덜란드)에 해당',
    threshold  = '{"countries": ["RU", "VN", "NL"]}',
    updated_at = UTC_TIMESTAMP(6)
WHERE rule_code = 'HIGH_RISK_COUNTRY_IP';
