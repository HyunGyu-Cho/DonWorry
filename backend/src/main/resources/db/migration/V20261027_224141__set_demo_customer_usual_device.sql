-- set_demo_customer_usual_device
-- 생성: 2026-10-27 22:41:41 KST
--
-- 규칙
-- * dev에 병합된 뒤에는 이 파일을 고치지 않는다. 바꿀 것이 있으면 새 migration을 만든다
-- * 다른 담당 테이블로 물리 FK를 걸지 않는다 (AGENTS.md 4절)
-- * 한 migration은 하나의 배포 가능한 스키마 전환만 담는다


-- P5 payment · 개인 저장소 Issue #98 (F-5)
-- 시연 김민수의 지난 결제(매입 완료 5건)는 늘 "집 노트북 · 국내 회선"에서 했다고 적어 둔다
-- 테스트 상점 "김민수 평소 환경"이 같은 기기 · IP를 보내면 R02 새 기기가 걸리지 않는다 (시연 ①은 그대로 55점)
UPDATE payments
SET device_id = 'demo-device-minsu-laptop',
    client_ip = '121.134.55.10'
WHERE customer_ref = 'cakeshop-member-1024'
  AND order_ref LIKE 'DEMO-PAST-%';
