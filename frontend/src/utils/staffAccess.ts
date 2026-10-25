// 로그인 모니터링 화면(1-2)의 계산 — React 없이 순수 함수만 (node 테스트가 직접 불러온다)
// 날짜 · 시간은 한국 시간 기준
import type { StaffLoginEvent, StaffSession } from '../types/auth.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const KST = 9 * HOUR

// 직원 룰 1: 10분에 3회 이상 인증 실패
export const AUTH_FAIL_WINDOW_MINUTES = 10
export const AUTH_FAIL_THRESHOLD = 3
// IP별 기준(10분 5회)에 못 미쳐도 계정 기준으로 묶으면 보이는 공격 (직원 룰 6)
export const PER_IP_THRESHOLD = 5
export const DISTRIBUTED_MIN_IPS = 10

const kstDay = (t: number) => Math.floor((t + KST) / DAY)
const kstHour = (t: number) => new Date(t + KST).getUTCHours()
const isFail = (e: StaffLoginEvent) => e.result !== 'SUCCESS'
const isOutside = (e: { ip: { ipType: string } }) => e.ip.ipType !== 'OFFICE'

// 세션 탈취 의심: 같은 직원의 진행 중 세션이 사내망과 사내망 밖에서 동시에 쓰임 → 사내망 밖 세션
export function suspiciousSessionIds(sessions: StaffSession[]): Set<number> {
  const active = sessions.filter((s) => s.endedAt === null)
  const ids = new Set<number>()
  for (const s of active) {
    if (!isOutside(s)) continue
    const sameUser = active.filter(
      (o) => o.userId === s.userId && o.staffSessionId !== s.staffSessionId,
    )
    if (sameUser.some((o) => !isOutside(o))) ids.add(s.staffSessionId)
  }
  return ids
}

export type AccessSummary = {
  activeSessions: number
  suspiciousSessions: number
  todayFailures: number
  outsideLogins7d: number
  staffAlerts: number
}

export function accessSummary(
  events: StaffLoginEvent[],
  sessions: StaffSession[],
  staffAlerts: number,
  now: Date,
): AccessSummary {
  const today = kstDay(now.getTime())
  const since = now.getTime() - 7 * DAY
  return {
    activeSessions: sessions.filter((s) => s.endedAt === null).length,
    suspiciousSessions: suspiciousSessionIds(sessions).size,
    todayFailures: events.filter((e) => isFail(e) && kstDay(Date.parse(e.occurredAt)) === today)
      .length,
    outsideLogins7d: events.filter((e) => isOutside(e) && Date.parse(e.occurredAt) >= since).length,
    staffAlerts,
  }
}

// 로그인 지도 칸: 아무것도 없음 · 사내 성공 · 사외 성공 · 실패 포함 · 사외 + 실패
export type HeatKind = 'NONE' | 'OFFICE_OK' | 'OUTSIDE_OK' | 'FAIL' | 'OUTSIDE_FAIL'

export type HeatCell = { kind: HeatKind; success: number; failure: number; outside: boolean }

export function heatKind(cellEvents: StaffLoginEvent[]): HeatKind {
  if (cellEvents.length === 0) return 'NONE'
  const fail = cellEvents.some(isFail)
  const outside = cellEvents.some(isOutside)
  if (fail && outside) return 'OUTSIDE_FAIL'
  if (fail) return 'FAIL'
  return outside ? 'OUTSIDE_OK' : 'OFFICE_OK'
}

// 7일 × 24시간. rows[0]이 6일 전, rows[6]이 오늘 (한국 시간)
export function loginHeatmap(events: StaffLoginEvent[], now: Date): HeatCell[][] {
  const today = kstDay(now.getTime())
  const buckets: StaffLoginEvent[][][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => []),
  )
  for (const e of events) {
    const t = Date.parse(e.occurredAt)
    const row = 6 - (today - kstDay(t))
    if (row < 0 || row > 6) continue
    buckets[row][kstHour(t)].push(e)
  }
  return buckets.map((hours) =>
    hours.map((cell) => ({
      kind: heatKind(cell),
      success: cell.filter((e) => !isFail(e)).length,
      failure: cell.filter(isFail).length,
      outside: cell.some(isOutside),
    })),
  )
}

export type IpFailures = { address: string; label: string; countryCode: string; failures: number }

export type DistributedAttack = {
  // IP별 실패 횟수 (많은 순)
  ips: IpFailures[]
  totalFailures: number
  // 계정별로 묶은 실패 횟수 (loginId → 횟수)
  byAccount: { loginId: string; failures: number; ips: number }[]
  // IP 하나도 IP별 기준에 닿지 않았는지 (그래서 기존 규칙으로는 안 보이는 공격)
  belowPerIpThreshold: boolean
}

// 최근 10분 사내망 밖 실패가 IP 10개 이상에 흩어져 있으면 분산 공격으로 본다. 아니면 null
export function distributedAttack(
  events: StaffLoginEvent[],
  now: Date,
  windowMinutes = AUTH_FAIL_WINDOW_MINUTES,
): DistributedAttack | null {
  const since = now.getTime() - windowMinutes * MINUTE
  const recent = events.filter(
    (e) => isFail(e) && isOutside(e) && Date.parse(e.occurredAt) >= since,
  )
  const perIp = new Map<string, IpFailures>()
  for (const e of recent) {
    const row = perIp.get(e.ip.address) ?? {
      address: e.ip.address,
      label: e.ip.label,
      countryCode: e.ip.countryCode,
      failures: 0,
    }
    row.failures += 1
    perIp.set(e.ip.address, row)
  }
  if (perIp.size < DISTRIBUTED_MIN_IPS) return null
  const accounts = new Map<string, { failures: number; ips: Set<string> }>()
  for (const e of recent) {
    const row = accounts.get(e.loginIdAttempted) ?? { failures: 0, ips: new Set<string>() }
    row.failures += 1
    row.ips.add(e.ip.address)
    accounts.set(e.loginIdAttempted, row)
  }
  const ips = [...perIp.values()].sort((a, b) => b.failures - a.failures)
  return {
    ips,
    totalFailures: recent.length,
    byAccount: [...accounts.entries()]
      .map(([loginId, v]) => ({ loginId, failures: v.failures, ips: v.ips.size }))
      .sort((a, b) => b.failures - a.failures),
    belowPerIpThreshold: ips.every((ip) => ip.failures < PER_IP_THRESHOLD),
  }
}
