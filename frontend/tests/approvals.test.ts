import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import {
  ApprovalForbiddenError,
  RejectReasonRequiredError,
} from '../src/api/investigationErrors.ts'
import {
  mockGetHandoffs,
  mockSubmitDecisions,
  resetMockCases,
  setMockActionDelay,
} from '../src/api/mock/cases.ts'
import { mockAddBlocklistEntry, mockGetBlocklist, resetMockFds } from '../src/api/mock/fds.ts'
import {
  buildMockAuditLogs,
  mockCreateApproval,
  mockDecideApproval,
  mockGetAuditLogs,
  resetMockInvestigation,
  setMockActor,
} from '../src/api/mock/investigation.ts'
import {
  auditActionText,
  auditDetailText,
  expiresText,
  handoffStage,
} from '../src/utils/approvals.ts'

const STAFF = { userId: 4, role: 'SECURITY_STAFF', displayName: '박지원' } as const
const MANAGER = { userId: 5, role: 'SECURITY_MANAGER', displayName: '최윤서' } as const
beforeEach(() => {
  resetMockInvestigation()
  resetMockFds()
  resetMockCases()
})

// 감사 로그 "어디서"는 서버 설명으로, 탈취 의심 세션의 행동은 표시가 붙는다
test('auditLogs_haveClientLabelAndSuspiciousFlag', () => {
  const logs = buildMockAuditLogs(new Date('2026-10-24T06:00:00Z'))
  const fromTor = logs.filter((l) => l.clientIp === '185.220.101.7')
  assert.ok(fromTor.length >= 2)
  assert.ok(fromTor.every((l) => l.suspiciousSession && l.client?.ipType === 'ANONYMOUS'))
  const office = logs.find((l) => l.clientIp === '10.20.0.22')
  assert.equal(office?.client?.label, '사내망 · 최윤서 업무 PC')
  assert.equal(office?.suspiciousSession, false)
  // 시스템 행동은 접속 위치가 없다
  assert.ok(logs.filter((l) => l.actorType === 'SYSTEM').every((l) => l.client === null))
})

// 거절은 이유가 필수, 승인한 차단 해제는 차단 목록에서 빠진다
test('approveBlocklistRelease_removesEntry_rejectNeedsReason', async () => {
  // Mock 시작 상태엔 차단 해제 대기가 없어 직접 만든다 — 이도현이 요청(1번은 이미 거절됨)
  setMockActor({ userId: 6, role: 'SECURITY_STAFF', displayName: '이도현' })
  const req = await mockCreateApproval({
    requestType: 'BLOCKLIST_RELEASE',
    targetType: 'BLOCKLIST_ENTRY',
    targetId: 4,
    targetLabel: '차단 목록 이메일 · 일회용 메일',
    reason: '고객 문의로 정상 메일 확인',
  })
  setMockActor(MANAGER)
  await assert.rejects(
    mockDecideApproval(req.approvalId, 'REJECT', '  '),
    RejectReasonRequiredError,
  )
  assert.ok((await mockGetBlocklist(true)).some((b) => b.entryId === 4))
  await mockDecideApproval(req.approvalId, 'APPROVE', '')
  const active = await mockGetBlocklist(true)
  assert.ok(!active.some((b) => b.entryId === 4))
  const released = (await mockGetBlocklist(false)).find((b) => b.entryId === 4)
  assert.equal(released?.releasedBy, MANAGER.userId)
})

// 자기 요청은 승인 못 하고, 승인 · 등록 · 판정이 감사 로그에 남는다
test('auditTrail_recordsApprovalBlocklistAndDecision', async () => {
  setMockActor(STAFF)
  await assert.rejects(mockDecideApproval(3, 'APPROVE', ''), ApprovalForbiddenError)
  await mockAddBlocklistEntry({
    entryType: 'DEVICE',
    entryValue: 'DEV-7E30',
    reason: '카드 테스팅 기기',
  })
  await mockSubmitDecisions('201', 4, {
    evidenceVersion: 1,
    reportId: 'R201',
    decisions: [{ casePaymentId: '2011', decision: 'REJECT', reason: '도용 의심' }],
  })
  setMockActor(MANAGER)
  await mockDecideApproval(3, 'APPROVE', '박지원과 통화로 확인')
  const actions = (await mockGetAuditLogs()).slice(0, 3).map((l) => l.action)
  assert.deepEqual(actions, ['APPROVAL_APPROVED', 'DECISION_CONFIRMED', 'BLOCKLIST_ADDED'])
  const added = (await mockGetBlocklist(true)).find((b) => b.entryValue === 'DEV-7E30')
  assert.equal(added?.createdBy, STAFF.userId)
})

// 조치 센터: 판정하면 조치가 생기고, 결제 상태가 바뀌면 완료
test('handoffs_afterDecision_showCompletedVoid', async () => {
  setMockActionDelay(0)
  const before = await mockGetHandoffs()
  assert.equal(before.length, 2)
  await mockSubmitDecisions('201', 4, {
    evidenceVersion: 1,
    reportId: 'R201',
    decisions: [{ casePaymentId: '2011', decision: 'REJECT', reason: '도용 의심' }],
  })
  const after = await mockGetHandoffs()
  assert.equal(after.length, 3)
  assert.equal(after[0].paymentTitle, '단체 행사용 케이크 세트')
  assert.equal(after[0].actionType, 'VOID')
  assert.equal(handoffStage(after[0]), 2)
  assert.equal(
    handoffStage({ status: 'ACCEPTED', actionType: 'CAPTURE', paymentStatus: 'HELD' }),
    1,
  )
  assert.equal(handoffStage({ status: 'REQUESTED', actionType: 'VOID', paymentStatus: 'HELD' }), 0)
  assert.equal(handoffStage({ status: 'FAILED', actionType: 'VOID', paymentStatus: 'HELD' }), -1)
})

test('humanText_forAuditAndExpiry', () => {
  assert.equal(auditActionText('APPROVAL_REJECTED'), '관리자 승인 · 거절')
  assert.equal(auditActionText('UNKNOWN_CODE'), 'UNKNOWN_CODE')
  assert.equal(auditDetailText({ attempts: 3 }), '3회 시도')
  assert.equal(auditDetailText({ rule: 'HIGH_AMOUNT' }), null)
  const now = new Date('2026-10-24T06:00:00Z')
  assert.equal(expiresText('2026-10-25T05:30:00Z', now), '23시간 뒤 만료')
  assert.equal(expiresText('2026-10-24T06:20:00Z', now), '곧 만료')
  assert.equal(expiresText('2026-10-24T05:00:00Z', now), '만료됨')
})

// 승인은 보안 관리자만 — 직원 계정 두 개가 함께 털려도 직원끼리 검사를 풀 수 없다
test('decideApproval_whenSecurityStaff_forbidden', async () => {
  setMockActor({ userId: 6, role: 'SECURITY_STAFF', displayName: '이도현' })
  await assert.rejects(mockDecideApproval(3, 'APPROVE', ''), ApprovalForbiddenError)
  setMockActor(MANAGER)
  const approved = await mockDecideApproval(3, 'APPROVE', '')
  assert.equal(approved.status, 'APPROVED')
})
