import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { RuleActionForbiddenError, RuleAlreadyEnabledError } from '../src/api/fdsErrors.ts'
import { ApprovalDuplicateError } from '../src/api/investigationErrors.ts'
import { mockEnableRule, mockGetRules, resetMockFds } from '../src/api/mock/fds.ts'
import { buildMockRuleHits } from '../src/api/mock/fdsEvaluations.ts'
import {
  mockCreateApproval,
  mockDecideApproval,
  mockGetApprovals,
  resetMockInvestigation,
  setMockActor,
} from '../src/api/mock/investigation.ts'
import { PAYMENT_RULE_CODES, STAFF_RULE_CODES, type FdsRule } from '../src/types/fds.ts'
import { canToggle, hitStats, pendingDisables, ruleState } from '../src/utils/ruleCatalog.ts'

const STAFF = { userId: 4, role: 'SECURITY_STAFF', displayName: '박지원' } as const
const MANAGER = { userId: 5, role: 'SECURITY_MANAGER', displayName: '최윤서' } as const
beforeEach(() => {
  resetMockFds()
  resetMockInvestigation()
})

// 한국 시간 10/24 15:00
const now = new Date('2026-10-24T06:00:00Z')

// 한국 시간으로 날짜를 나누지 않으면 아침 8시 적중이 어제 칸에 들어간다
test('hitStats_countsByKoreanDay', () => {
  const stats = hitStats(
    [
      { ruleCode: 'NEW_CARD', at: '2026-10-23T23:30:00Z' }, // 오늘 08:30
      { ruleCode: 'NEW_CARD', at: '2026-10-23T14:59:00Z' }, // 어제 23:59
      { ruleCode: 'NEW_CARD', at: '2026-10-17T15:00:00Z' }, // 6일 전 00:00 — 첫 칸
      { ruleCode: 'NEW_CARD', at: '2026-10-17T14:59:00Z' }, // 7일 전 — 기간 밖
      { ruleCode: 'HIGH_AMOUNT', at: '2026-10-24T05:00:00Z' },
    ],
    ['NEW_CARD', 'NEW_DEVICE'],
    now,
  )
  assert.deepEqual(stats[0].daily, [1, 0, 0, 0, 0, 1, 1])
  assert.equal(stats[0].total, 3)
  assert.equal(stats[0].lastHitAt, '2026-10-23T23:30:00Z')
  // 적중이 없으면 0과 null
  assert.deepEqual(stats[1], {
    ruleCode: 'NEW_DEVICE',
    daily: [0, 0, 0, 0, 0, 0, 0],
    total: 0,
    lastHitAt: null,
  })
})

// Mock 시나리오: 결제 · 직원 Rule 모두 오늘 적중이 있어야 카드가 "방금 적중"으로 보인다
test('mockRuleHits_todayHasScenarioHits', () => {
  const codes = [...PAYMENT_RULE_CODES, ...STAFF_RULE_CODES]
  const stats = hitStats(buildMockRuleHits(now), codes, now)
  assert.equal(stats.length, 15)
  for (const code of ['BLOCKLIST', 'CARD_TESTING', 'NEW_CARD', 'STAFF_DISTRIBUTED'] as const) {
    const stat = stats.find((s) => s.ruleCode === code)
    assert.ok(stat && stat.daily[6] > 0, `${code} 오늘 적중 없음`)
  }
  // 지난 사건 91의 새 기기 경보(24일 전)는 7일 칸에 들어가지 않는다 (13시간 전 1건만)
  const device = stats.find((s) => s.ruleCode === 'STAFF_NEW_DEVICE')
  assert.equal(device?.total, 1)
})

const rule = (over: Partial<FdsRule>): FdsRule => ({
  ruleId: 1,
  ruleCode: 'HIGH_AMOUNT',
  displayCode: 'R01',
  target: 'PAYMENT',
  displayName: '고액 결제',
  criteria: '',
  action: 'SCORE',
  score: 30,
  severity: null,
  threshold: null,
  enabled: true,
  updatedBy: null,
  updatedAt: '',
  ...over,
})

// 차단 목록 · 직원 Rule을 끌 수 있으면 공격자가 자기 흔적을 지울 수 있다
test('canToggle_onlyPaymentRulesExceptBlocklist', () => {
  assert.equal(canToggle(rule({})), true)
  assert.equal(canToggle(rule({ ruleCode: 'BLOCKLIST' })), false)
  assert.equal(canToggle(rule({ ruleCode: 'CONCURRENT_SESSION', target: 'STAFF' })), false)
})

test('ruleState_offFirstThenRecentHit', () => {
  const recent = { lastHitAt: new Date(now.getTime() - 9 * 60_000).toISOString() }
  const old = { lastHitAt: new Date(now.getTime() - 11 * 60_000).toISOString() }
  assert.equal(ruleState(rule({ enabled: false }), recent, now), 'OFF')
  assert.equal(ruleState(rule({}), recent, now), 'JUST_HIT')
  assert.equal(ruleState(rule({}), old, now), 'ON')
  assert.equal(ruleState(rule({}), undefined, now), 'ON')
})

// 끄기 요청은 한 번만 쌓이고, 관리자가 승인해야 꺼진다. 다시 켜기는 바로
test('ruleDisable_needsApproval_enableIsImmediate', async () => {
  // Mock 시작: 고액 결제(2) 끄기 요청이 승인 대기
  const pending = pendingDisables(await mockGetApprovals('PENDING'))
  assert.equal(pending.get(2)?.requestedByName, '박지원')

  setMockActor(STAFF)
  const input = {
    requestType: 'RULE_DISABLE',
    targetType: 'FDS_RULE',
    targetId: 4,
    targetLabel: '"기존 결제 이력 없는 카드" Rule',
    reason: '오탐 점검',
  } as const
  const created = await mockCreateApproval(input)
  await assert.rejects(mockCreateApproval(input), ApprovalDuplicateError)
  // 요청만으로는 꺼지지 않는다
  assert.equal((await mockGetRules()).find((r) => r.ruleId === 4)?.enabled, true)

  setMockActor(MANAGER)
  await mockDecideApproval(created.approvalId, 'APPROVE', '확인')
  assert.equal((await mockGetRules()).find((r) => r.ruleId === 4)?.enabled, false)

  setMockActor(STAFF)
  const enabled = await mockEnableRule(4)
  assert.equal(enabled.enabled, true)
  assert.equal(enabled.updatedBy, STAFF.userId)
  await assert.rejects(mockEnableRule(4), RuleAlreadyEnabledError)
  // 차단 목록 일치(1)는 켜기 · 끄기 대상이 아니다
  await assert.rejects(mockEnableRule(1), RuleActionForbiddenError)
})
