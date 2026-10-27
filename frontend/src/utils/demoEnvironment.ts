// 테스트 상점에서 고른 접속 환경을 이 탭에만 기억한다 (#98 F-5) — 결제창이 결제할 때 헤더로 보낸다
import { DEMO_ENVIRONMENTS, type DemoEnvironment } from '../config/demoEnvironments.ts'

const KEY = 'dw-demo-environment'

// 저장소를 못 쓰는 환경(시크릿 창 등)이면 기억하지 않는다
export function saveDemoEnvironment(id: string): void {
  try {
    sessionStorage.setItem(KEY, id)
  } catch {
    // 기억 못 해도 결제는 실제 접속 정보로 진행된다
  }
}

export function chosenDemoEnvironment(): DemoEnvironment | null {
  try {
    const id = sessionStorage.getItem(KEY)
    return DEMO_ENVIRONMENTS.find((env) => env.id === id) ?? null
  } catch {
    return null
  }
}

// 결제 요청에 붙일 시연 헤더 — 테스트 상점에서 고른 적이 없으면 붙이지 않는다
export function demoEnvironmentHeaders(env: DemoEnvironment | null): Record<string, string> {
  return env ? { 'X-Demo-Client-IP': env.ip, 'X-Demo-Device-Id': env.deviceId } : {}
}
