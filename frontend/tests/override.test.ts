import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { InvalidOtpError } from '../src/api/auth.ts'
import { ReauthRequiredError } from '../src/api/caseErrors.ts'
import {
  mockGetCase,
  mockGetHandoffs,
  mockSubmitDecisions,
  resetMockCases,
} from '../src/api/mock/cases.ts'
import {
  DEMO_OTP,
  mockLogout,
  mockReauth,
  mockStartLogin,
  mockVerifyOtp,
} from '../src/api/mock/identity.ts'
import {
  mockDecideApproval,
  mockGetApprovals,
  resetMockInvestigation,
  setMockActor,
} from '../src/api/mock/investigation.ts'
import { historyText } from '../src/utils/caseView.ts'

const MANAGER = { userId: 5, role: 'SECURITY_MANAGER', displayName: '최윤서' } as const
// 사건 201 · 결제 31 — AI 권고는 "승인 취소 검토"
const accept = {
  evidenceVersion: 1,
  reportId: 'R201',
  decisions: [
    { casePaymentId: '2011', decision: 'ACCEPT' as const, reason: '고객 통화로 본인 확인' },
  ],
}

async function loginJiwon() {
  const step = await mockStartLogin('jiwon', '1234')
  assert.equal(step.status, 'OTP_REQUIRED')
  if (step.status === 'OTP_REQUIRED') await mockVerifyOtp(step.challengeId, DEMO_OTP)
}

beforeEach(async () => {
  resetMockCases()
  resetMockInvestigation()
  await mockLogout()
  await loginJiwon()
})

// 권고 반대 판정은 재인증 없이는 안 되고, 재인증하면 바로 반영 대신 관리자 승인 대기
test('override_needsReauth_thenWaitsForManager', async () => {
  await assert.rejects(mockSubmitDecisions('201', 4, accept), ReauthRequiredError)
  await assert.rejects(mockReauth('000000'), InvalidOtpError)
  const ticket = await mockReauth(DEMO_OTP)
  const result = await mockSubmitDecisions('201', 4, { ...accept, reauthToken: ticket.reauthToken })
  assert.equal(result.outcome, 'APPROVAL_PENDING')
  const c = await mockGetCase('201')
  assert.equal(c?.securityCase.status, 'APPROVAL_PENDING')
  assert.equal(c?.decisions.length, 0)
  // 표는 한 번만 쓴다
  await assert.rejects(
    mockSubmitDecisions('201', 4, { ...accept, reauthToken: ticket.reauthToken }),
    ReauthRequiredError,
  )
  const pending = (await mockGetApprovals('PENDING')).find(
    (a) => a.approvalId === result.approvalId,
  )
  assert.equal(pending?.requestType, 'DECISION_OVERRIDE')
  assert.equal(pending?.payload?.caseId, '201')
})

// 관리자가 승인하면 판정이 반영되고 매입이 진행된다
test('override_approved_appliesDecisionAndCapture', async () => {
  const ticket = await mockReauth(DEMO_OTP)
  const result = await mockSubmitDecisions('201', 4, { ...accept, reauthToken: ticket.reauthToken })
  setMockActor(MANAGER)
  await mockDecideApproval(result.approvalId as number, 'APPROVE', '박지원과 통화로 확인')
  const c = await mockGetCase('201')
  assert.equal(c?.securityCase.status, 'CLOSED')
  assert.equal(c?.decisions[0].decision, 'ACCEPT')
  assert.equal(c?.payments[0].paymentStatus, 'CAPTURED')
  assert.equal((await mockGetHandoffs())[0].actionType, 'CAPTURE')
  const approvedRow = c?.history.find((h) => h.eventData.to === 'APPROVED')
  assert.equal(historyText(approvedRow!).title, '관리자 승인 · 판정 반영')
})

// 관리자가 거절하면 판정 대기로 돌아가고, 거절 이유가 기록에 남는다
test('override_rejected_backToDecisionPending', async () => {
  const ticket = await mockReauth(DEMO_OTP)
  const result = await mockSubmitDecisions('201', 4, { ...accept, reauthToken: ticket.reauthToken })
  setMockActor(MANAGER)
  await mockDecideApproval(result.approvalId as number, 'REJECT', '구매자 응답이 없어 보류')
  const c = await mockGetCase('201')
  assert.equal(c?.securityCase.status, 'DECISION_PENDING')
  assert.equal(c?.payments[0].paymentStatus, 'HELD')
  const row = c?.history.find((h) => h.eventData.to === 'REJECTED')
  assert.deepEqual(historyText(row!), {
    title: '관리자 거절 · 다시 판정 대기',
    sub: '메모: 구매자 응답이 없어 보류',
  })
})

// 권고와 같은 판정은 재인증 없이 바로 반영
test('sameAsRecommendation_decidesImmediately', async () => {
  const result = await mockSubmitDecisions('201', 4, {
    ...accept,
    decisions: [{ casePaymentId: '2011', decision: 'REJECT', reason: '도용 의심' }],
  })
  assert.deepEqual(result, { outcome: 'DECIDED', approvalId: null })
})
