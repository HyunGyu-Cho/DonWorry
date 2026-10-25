import assert from 'node:assert/strict'
import { test } from 'node:test'
import { kstDate } from '../src/config/settlement.ts'
import { SCENARIOS, scenarioById } from '../src/config/scenarios.ts'
import { buildMockSettlements } from '../src/api/mock/settlement.ts'
import {
  caseGroupCounts,
  latest,
  nextSettlement,
  openHandoffs,
  topRules,
} from '../src/utils/homeView.ts'
import type { CaseStatus } from '../src/types/case.ts'
import type { RuleHitStat } from '../src/types/fds.ts'

const now = new Date('2026-10-25T03:00:00Z')
const today = kstDate(now)

// 홈 숫자가 목록 화면 탭 숫자와 다르면 직원이 어느 쪽을 믿어야 할지 모른다
test('caseGroupCounts_matchesListTabs', () => {
  const rows: { status: CaseStatus }[] = [
    { status: 'OPEN' },
    { status: 'INVESTIGATING' },
    { status: 'DECISION_PENDING' },
    { status: 'APPROVAL_PENDING' },
    { status: 'ACTION_FAILED' },
    { status: 'CLOSED' },
  ]
  assert.deepEqual(caseGroupCounts(rows), { AI: 2, DECISION: 1, APPROVAL: 1, ACTION: 1, CLOSED: 1 })
})

test('openHandoffs_countsUnfinishedAndFailed', () => {
  const rows = [
    {
      status: 'ACCEPTED' as const,
      actionType: 'CAPTURE' as const,
      paymentStatus: 'CAPTURED' as const,
    },
    { status: 'ACCEPTED' as const, actionType: 'VOID' as const, paymentStatus: 'HELD' as const },
    { status: 'FAILED' as const, actionType: 'VOID' as const, paymentStatus: 'HELD' as const },
    {
      status: 'REQUESTED' as const,
      actionType: 'CAPTURE' as const,
      paymentStatus: 'HELD' as const,
    },
  ]
  assert.deepEqual(openHandoffs(rows), { open: 3, failed: 1 })
})

test('topRules_skipsZeroAndSorts', () => {
  const stats: RuleHitStat[] = [
    { ruleCode: 'HIGH_AMOUNT', daily: [], total: 2, lastHitAt: null },
    { ruleCode: 'BLOCKLIST', daily: [], total: 0, lastHitAt: null },
    { ruleCode: 'NEW_CARD', daily: [], total: 5, lastHitAt: null },
  ]
  assert.deepEqual(
    topRules(stats).map((s) => s.ruleCode),
    ['NEW_CARD', 'HIGH_AMOUNT'],
  )
})

test('latest_newestFirst', () => {
  const rows = [{ at: '2026-10-01' }, { at: '2026-10-03' }, { at: '2026-10-02' }]
  assert.deepEqual(
    latest(rows, (r) => r.at, 2).map((r) => r.at),
    ['2026-10-03', '2026-10-02'],
  )
})

// 사장님 홈 "다음 정산"은 완료된 정산이 아니라 앞으로 들어올 것
test('nextSettlement_upcomingOnly', () => {
  const next = nextSettlement(buildMockSettlements(now), today)!
  assert.ok(next.date >= today)
  assert.ok(next.amount > 0)
  assert.equal(nextSettlement([], today), null)
})

test('scenarios_fiveWithDemoAccounts', () => {
  assert.equal(SCENARIOS.length, 5)
  assert.deepEqual(
    SCENARIOS.map((s) => s.mark),
    ['①', '②', '③', '④', '⑤'],
  )
  for (const s of SCENARIOS) assert.ok(['jiwon', 'yunseo', 'boss'].includes(s.loginId))
  assert.equal(scenarioById(99), null)
})
