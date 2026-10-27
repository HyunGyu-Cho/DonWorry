// 테스트 상점에서 고른 접속 환경 · 구매자를 이 탭에만 기억한다 (#98 F-5, #100 S-4) — 결제창이 결제할 때 헤더로 보낸다
import { DEMO_ENVIRONMENTS, type DemoEnvironment } from '../config/demoEnvironments.ts'
import type { TestBuyer } from '../types/checkout.ts'

const KEY = 'dw-demo-environment'
const BUYER_KEY = 'dw-demo-buyer'
const GUEST_KEY = 'dw-demo-guest-key'

// 저장소를 못 쓰는 환경(시크릿 창 등)에서는 이 화면이 열려 있는 동안만 기억한다
let memoryGuestKey: string | null = null

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // 기억 못 해도 결제는 실제 접속 정보로 진행된다
  }
}

export function saveDemoEnvironment(id: string): void {
  write(KEY, id)
}

export function chosenDemoEnvironment(): DemoEnvironment | null {
  const id = read(KEY)
  return DEMO_ENVIRONMENTS.find((env) => env.id === id) ?? null
}

export function saveDemoBuyer(buyer: TestBuyer): void {
  write(BUYER_KEY, buyer)
}

export function chosenDemoBuyer(): TestBuyer {
  return read(BUYER_KEY) === 'GUEST' ? 'GUEST' : 'MINSU'
}

// 서버 TestShop.GUEST_KEY와 같은 모양 — 소문자 · 숫자 8자
export function newGuestKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

// "처음 온 손님" 번호 — 탭마다 새 손님. 같은 탭에서 다시 결제하면 같은 손님이다
export function demoGuestKey(): string {
  const saved = read(GUEST_KEY) ?? memoryGuestKey
  if (saved) return saved
  return renewDemoGuestKey()
}

export function renewDemoGuestKey(): string {
  const key = newGuestKey()
  memoryGuestKey = key
  write(GUEST_KEY, key)
  return key
}

// 결제 요청에 붙일 시연 헤더 — 테스트 상점에서 고른 적이 없으면 붙이지 않는다
// 처음 온 손님은 기기도 손님마다 다르다 → 기기를 차단해도 다음 시연(새 탭)은 처음부터 다시 해 볼 수 있다
export function demoEnvironmentHeaders(
  env: DemoEnvironment | null,
  guestKey: string | null = null,
): Record<string, string> {
  if (!env) return {}
  const deviceId = guestKey ? `${env.deviceId}-${guestKey}` : env.deviceId
  return { 'X-Demo-Client-IP': env.ip, 'X-Demo-Device-Id': deviceId }
}

// 결제창이 쓸 손님 번호 — 김민수로 주문했으면 없음
export function chosenGuestKey(): string | null {
  return chosenDemoBuyer() === 'GUEST' ? demoGuestKey() : null
}
