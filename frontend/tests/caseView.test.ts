import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { CaseVersionConflictError } from '../src/api/caseErrors.ts'
import { StaffCaseForbiddenError } from '../src/api/investigationErrors.ts'
import {
  buildMockCases,
  mockGetCase,
  mockGetCases,
  mockSubmitDecisions,
  resetMockCases,
} from '../src/api/mock/cases.ts'
import { buildMockStaffAlerts } from '../src/api/mock/fds.ts'
import { buildMockEvaluations } from '../src/api/mock/fdsEvaluations.ts'
import {
  buildMockStaffCases,
  mockGetStaffCase,
  resetMockInvestigation,
  setMockActor,
} from '../src/api/mock/investigation.ts'
import { buildMockPayments } from '../src/api/mock/payment.ts'
import {
  caseStage,
  paymentFlowCards,
  staffFlowCards,
  staffVerdicts,
} from '../src/utils/caseView.ts'

const now = new Date('2026-10-24T06:00:00Z')
const name = (code: string) => code
beforeEach(() => {
  resetMockCases()
  resetMockInvestigation()
})

test('caseStage_followsStatusAndAi', () => {
  assert.equal(caseStage('INVESTIGATING', false), 1)
  assert.equal(caseStage('DECISION_PENDING', false), 2)
  // 판정 대기여도 조사가 다시 돌면 AI 조사 단계
  assert.equal(caseStage('DECISION_PENDING', true), 1)
  assert.equal(caseStage('APPROVAL_PENDING', false), 2)
  assert.equal(caseStage('ACTION_PENDING', false), 3)
  assert.equal(caseStage('CLOSED', false), 5)
})

// 사건 201은 결제 31 · 경보 103과 같은 장면이어야 흐름도 카드가 맞는 경보로 간다
test('mockCase201_matchesPaymentAndAlert', () => {
  const c201 = buildMockCases(now).find((d) => d.securityCase.caseId === '201')!
  const p = c201.payments[0]
  const evaluation = buildMockEvaluations(now).find(
    (d) => d.evaluation.evaluationId === p.evaluationId,
  )!
  assert.equal(evaluation.evaluation.paymentId, Number(p.paymentId))
  assert.equal(evaluation.evaluation.caseId, '201')
  assert.equal(evaluation.evaluation.riskScore, p.riskScore)
  assert.deepEqual([...evaluation.evaluation.hitRuleCodes].sort(), [...p.hitRuleCodes].sort())
  assert.equal(buildMockPayments(now).find((x) => x.paymentId === p.paymentId)?.amount, p.amount)

  const cards = paymentFlowCards(c201, name, true)
  assert.equal(cards.length, 1)
  assert.equal(cards[0].href, '/security/alerts/103')
  assert.equal(cards[0].title, '65만 원 결제')
  // 관리자는 결제 경보 화면이 없어 링크 없음
  assert.equal(paymentFlowCards(c201, name, false)[0].href, null)
})

test('staffFlowCards_onlyLinkedAlertsInTimeOrder', () => {
  const c101 = buildMockStaffCases(now).find((c) => c.caseId === '101')!
  const cards = staffFlowCards(c101, buildMockStaffAlerts(now), name)
  assert.deepEqual(
    cards.map((c) => c.key),
    ['1', '2', '3', '4'],
  )
  assert.ok(cards.every((c, i) => i === 0 || cards[i - 1].at <= c.at))
  assert.ok(cards.every((c) => c.href === null))
})

test('staffVerdicts_actionSets', () => {
  assert.deepEqual(
    staffVerdicts('STAFF_SPRAY').map((v) => v.key),
    ['ATTACK', 'LEGIT'],
  )
  const takeover = staffVerdicts('STAFF_TAKEOVER')[0]
  assert.ok(takeover.actions.includes('KILL_SESSIONS') && takeover.actions.includes('LOCK_STAFF'))
  assert.deepEqual(staffVerdicts('STAFF_TAKEOVER')[1].actions, ['CLEAR_FLAG'])
})

// 판정하면 조치가 접수되고, 모든 결제가 판정되면 사건이 끝난다
test('mockSubmitDecisions_closesCaseAndAddsHistory', async () => {
  const before = await mockGetCase('201')
  assert.equal(before?.securityCase.status, 'DECISION_PENDING')
  await assert.rejects(
    mockSubmitDecisions('201', 4, { evidenceVersion: 99, reportId: 'R201', decisions: [] }),
    CaseVersionConflictError,
  )
  await mockSubmitDecisions('201', 4, {
    evidenceVersion: 1,
    reportId: 'R201',
    decisions: [{ casePaymentId: '2011', decision: 'REJECT', reason: '구매자 미확인 · 도용 의심' }],
  })
  const after = await mockGetCase('201')
  assert.equal(after?.securityCase.status, 'CLOSED')
  assert.equal(after?.payments[0].paymentStatus, 'VOIDED')
  assert.equal(after?.handoffs[0].actionType, 'VOID')
  assert.ok(after?.history.some((h) => h.eventType === 'CASE_CLOSED'))
  const list = await mockGetCases()
  assert.deepEqual(list.find((c) => c.caseId === '201')?.hitRuleCodes, [
    'HIGH_AMOUNT',
    'AMOUNT_SPIKE',
    'NEW_CARD',
  ])
})

// 직원 사건은 보안 관리자만 연다 (직무 분리)
test('mockGetStaffCase_whenNotManager_forbidden', async () => {
  setMockActor({ userId: 4, role: 'SECURITY_STAFF', displayName: '박지원' })
  await assert.rejects(mockGetStaffCase('101'), StaffCaseForbiddenError)
  assert.equal(await mockGetStaffCase('999'), null)
  setMockActor({ userId: 5, role: 'SECURITY_MANAGER', displayName: '최윤서' })
  assert.equal((await mockGetStaffCase('101'))?.caseType, 'STAFF_TAKEOVER')
})
