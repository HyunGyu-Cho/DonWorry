// 테스트 상점 "접속 환경" (#98 F-5) — 결제창이 이 IP · 기기에서 결제한 것처럼 보낸다
// 서버는 시연 설정(DONWORRY_DEMO_FAKE_CLIENT_IP)이 켜졌을 때만 믿고, IP는 demo_fake_ips 이름표에 있는 값만 받는다
export type DemoEnvironment = {
  id: string
  label: string
  // 화면에 보일 한 줄 설명
  description: string
  ip: string
  deviceId: string
}

export const DEMO_ENVIRONMENTS: DemoEnvironment[] = [
  {
    id: 'usual',
    label: '김민수 평소 환경',
    description: '국내 회선 · 늘 쓰던 집 노트북 (시연 ①)',
    ip: '121.134.55.10',
    deviceId: 'demo-device-minsu-laptop',
  },
  {
    id: 'new-phone',
    label: '김민수 새 휴대폰',
    description: '국내 회선 · 처음 보는 휴대폰 → 새 기기 Rule',
    ip: '121.134.55.10',
    deviceId: 'demo-device-minsu-newphone',
  },
  {
    id: 'vpn',
    label: '해외 VPN',
    description: '네덜란드 VPN 대역 · 처음 보는 기기 (카드 테스팅 시연)',
    ip: '45.83.64.12',
    deviceId: 'demo-device-attacker',
  },
  {
    id: 'tor',
    label: 'Tor',
    description: '독일 Tor 출구 · 처음 보는 기기',
    ip: '185.220.101.7',
    deviceId: 'demo-device-tor',
  },
]

export const DEFAULT_DEMO_ENVIRONMENT = DEMO_ENVIRONMENTS[0]
