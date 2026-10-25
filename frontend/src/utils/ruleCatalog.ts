// Rule 카탈로그 화면(1-3)의 계산 — React 없이 순수 함수만 (node 테스트가 직접 불러온다)
// 날짜는 한국 시간 기준
import type { FdsRule, RuleCode, RuleHitStat } from '../types/fds.ts'
import type { ApprovalRequest } from '../types/investigation.ts'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const KST = 9 * 60 * MINUTE

export const HIT_DAYS = 7
// 마지막 적중이 이 시간 안이면 "방금 적중"
export const JUST_HIT_MINUTES = 10

const kstDay = (t: number) => Math.floor((t + KST) / DAY)

// 적중 시각 목록 → Rule별 하루 적중 수 (오래된 날 → 오늘). 백엔드 hit-stats와 같은 규칙
export function hitStats(
  hits: { ruleCode: RuleCode; at: string }[],
  codes: readonly RuleCode[],
  now: Date,
  days = HIT_DAYS,
): RuleHitStat[] {
  const today = kstDay(now.getTime())
  return codes.map((ruleCode) => {
    const daily = Array.from({ length: days }, () => 0)
    let lastHitAt: string | null = null
    for (const hit of hits) {
      if (hit.ruleCode !== ruleCode) continue
      const t = Date.parse(hit.at)
      if (t > now.getTime()) continue
      if (!lastHitAt || hit.at > lastHitAt) lastHitAt = hit.at
      const index = days - 1 - (today - kstDay(t))
      if (index >= 0) daily[index] += 1
    }
    return { ruleCode, daily, total: daily.reduce((a, b) => a + b, 0), lastHitAt }
  })
}

// 끄기 요청 · 다시 켜기는 결제 Rule만. 차단 목록 일치는 끌 수 없다 (재범 방지)
// 직원 Rule은 끄면 탈취한 계정이 자기 흔적을 지울 수 있어 화면에서 막는다
export function canToggle(rule: Pick<FdsRule, 'target' | 'ruleCode'>): boolean {
  return rule.target === 'PAYMENT' && rule.ruleCode !== 'BLOCKLIST'
}

// rule_id → 승인을 기다리는 끄기 요청
export function pendingDisables(approvals: ApprovalRequest[]): Map<number, ApprovalRequest> {
  const result = new Map<number, ApprovalRequest>()
  for (const a of approvals) {
    if (a.status === 'PENDING' && a.requestType === 'RULE_DISABLE' && a.targetType === 'FDS_RULE')
      result.set(a.targetId, a)
  }
  return result
}

export type RuleState = 'OFF' | 'JUST_HIT' | 'ON'

export function ruleState(
  rule: Pick<FdsRule, 'enabled'>,
  stat: Pick<RuleHitStat, 'lastHitAt'> | undefined,
  now: Date,
): RuleState {
  if (!rule.enabled) return 'OFF'
  const last = stat?.lastHitAt ? Date.parse(stat.lastHitAt) : null
  if (last !== null && now.getTime() - last <= JUST_HIT_MINUTES * MINUTE) return 'JUST_HIT'
  return 'ON'
}
