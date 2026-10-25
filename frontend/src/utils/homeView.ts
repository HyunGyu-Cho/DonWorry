// 홈 대시보드 3종(1-11)의 숫자 세기 — React 없이 순수 함수만 (node 테스트가 직접 불러온다)
// 숫자는 각 목록 화면의 탭 숫자와 같은 기준으로 센다
import { entryDate } from './settlementView.ts'
import type { CaseStatus, HandoffRow } from '../types/case.ts'
import type { RuleHitStat } from '../types/fds.ts'
import type { SettlementEntry } from '../types/settlement.ts'

export type CaseGroup = 'AI' | 'DECISION' | 'APPROVAL' | 'ACTION' | 'CLOSED'

// 사건 목록 화면 탭과 같은 묶음 (조치 진행은 탭에는 없고 전체에만 있다)
export const CASE_GROUP: Record<CaseGroup, { label: string; statuses: CaseStatus[] }> = {
  AI: { label: 'AI 조사 중', statuses: ['OPEN', 'INVESTIGATING'] },
  DECISION: { label: '판정 대기', statuses: ['DECISION_PENDING'] },
  APPROVAL: { label: '관리자 승인 대기', statuses: ['APPROVAL_PENDING'] },
  ACTION: { label: '조치 진행', statuses: ['ACTION_PENDING', 'ACTION_FAILED'] },
  CLOSED: { label: '종료', statuses: ['CLOSED'] },
}
export const CASE_GROUP_ORDER: CaseGroup[] = ['AI', 'DECISION', 'APPROVAL', 'ACTION', 'CLOSED']

export function caseGroupCounts(rows: { status: CaseStatus }[]): Record<CaseGroup, number> {
  const counts = { AI: 0, DECISION: 0, APPROVAL: 0, ACTION: 0, CLOSED: 0 }
  for (const r of rows) {
    const group = CASE_GROUP_ORDER.find((g) => CASE_GROUP[g].statuses.includes(r.status))
    if (group) counts[group] += 1
  }
  return counts
}

export const inGroup = (status: CaseStatus, group: CaseGroup) =>
  CASE_GROUP[group].statuses.includes(status)

// 조치 센터에서 아직 끝나지 않은 인계 (실패 포함) — 끝난 것 = 결제 상태까지 반영됨
export function openHandoffs(rows: Pick<HandoffRow, 'status' | 'actionType' | 'paymentStatus'>[]) {
  const open = rows.filter((r) => {
    if (r.status !== 'ACCEPTED') return true
    return r.paymentStatus !== (r.actionType === 'CAPTURE' ? 'CAPTURED' : 'VOIDED')
  })
  return { open: open.length, failed: open.filter((r) => r.status === 'FAILED').length }
}

// 최근 7일 많이 걸린 Rule (0건은 빼고)
export const topRules = (stats: RuleHitStat[], n = 3) =>
  [...stats]
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, n)

// 최신순 n개
export function latest<T>(rows: T[], at: (row: T) => string, n: number): T[] {
  return [...rows].sort((a, b) => at(b).localeCompare(at(a))).slice(0, n)
}

// 오늘 이후 가장 가까운 정산일과 그날 받을 돈 (완료 · 취소 제외)
export function nextSettlement(entries: SettlementEntry[], today: string) {
  const upcoming = entries.filter((e) => e.status === 'SCHEDULED' && entryDate(e) >= today)
  if (upcoming.length === 0) return null
  const date = upcoming.map(entryDate).sort()[0]
  const sameDay = upcoming.filter((e) => entryDate(e) === date)
  return {
    date,
    amount: sameDay.reduce((n, e) => n + e.settlementAmount, 0),
    count: sameDay.length,
    // 픽업 전이라 늦어질 수 있는 정산이 섞였는지
    unconfirmed: sameDay.some((e) => e.scheduledAt === null),
  }
}
