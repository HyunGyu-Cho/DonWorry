-- update_distributed_demo_ip_labels
-- 생성: 2026-10-24 19:11:24 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다

-- P1 identity · 개인 저장소 Issue #26 (화면 원칙: IP 원문은 문장에 쓰지 않는다)
-- 분산 공격 IP 30개의 표시용 설명에 IP 대역(45.83.64.x 등)이 들어 있어 나라 이름으로 바꾼다
UPDATE demo_fake_ips
SET label = CONCAT('해외 분산 공격 IP (',
                   CASE country_code
                       WHEN 'NL' THEN '네덜란드'
                       WHEN 'RU' THEN '러시아'
                       WHEN 'VN' THEN '베트남'
                       WHEN 'DE' THEN '독일'
                       WHEN 'GB' THEN '영국'
                       ELSE '해외'
                       END,
                   ')')
WHERE ip_type = 'FOREIGN'
  AND label LIKE '분산 공격 IP 묶음 %';
