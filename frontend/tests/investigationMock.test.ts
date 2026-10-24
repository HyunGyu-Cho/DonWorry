import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { CaseActionForbiddenError, SelfApprovalError } from '../src/api/investigationErrors.ts'
import { buildMockStaffAlerts } from '../src/api/mock/fds.ts'
import { MOCK_USERS } from '../src/api/mock/identity.ts'
import {
  buildMockAuditLogs,
  buildMockStaffCases,
  mockCreateApproval,
  mockDecideApproval,
  mockGetAuditLogs,
  mockRequestCaseActions,
  resetMockInvestigation,
  setMockActor,
} from '../src/api/mock/investigation.ts'

const jiwon = { userId: 4, role: 'SECURITY_STAFF', displayName: '박지원' } as const
const yunseo = { userId: 5, role: 'SECURITY_MANAGER', displayName: '최윤서' } as const
const otherManager = { userId: 9, role: 'SECURITY_MANAGER', displayName: '다른 관리자' } as const

beforeEach(() => resetMockInvestigation())

// 요청자가 자기 요청을 승인할 수 있으면 2인 승인이 무력화된다
test('mockDecideApproval_whenRequesterApprovesOwn_rejects', async () => {
  setMockActor(yunseo)
  const created = await mockCreateApproval({
    requestType: 'RULE_DISABLE',
    targetType: 'FDS_RULE',
    targetId: 2,
    targetLabel: '"고액 결제" Rule',
    reason: '테스트',
  })
  await assert.rejects(
    mockDecideApproval(created.approvalId, 'APPROVE', '본인 승인'),
    SelfApprovalError,
  )
  await assert.rejects(
    mockDecideApproval(created.approvalId, 'REJECT', '본인 거절'),
    SelfApprovalError,
  )
  setMockActor(otherManager)
  const decided = await mockDecideApproval(created.approvalId, 'APPROVE', '확인함')
  assert.equal(decided.status, 'APPROVED')
  assert.equal(decided.decidedBy, otherManager.userId)
})

// 탈취된 직원이 자기 사건을 닫거나, 보안 직원이 직원 사건을 판정하면 안 된다
test('mockRequestCaseActions_whenNotManagerOrSubject_rejects', async () => {
  setMockActor(jiwon)
  await assert.rejects(
    mockRequestCaseActions('101', [{ actionType: 'CLEAR_FLAG' }]),
    CaseActionForbiddenError,
  )
  // 대상 직원이 보안 관리자 역할이어도 자기 사건은 불가
  setMockActor({ ...jiwon, role: 'SECURITY_MANAGER' })
  await assert.rejects(
    mockRequestCaseActions('101', [{ actionType: 'CLEAR_FLAG' }]),
    CaseActionForbiddenError,
  )
  setMockActor(yunseo)
  const closed = await mockRequestCaseActions('101', [
    { actionType: 'KILL_SESSIONS' },
    { actionType: 'LOCK_STAFF' },
  ])
  assert.equal(closed.status, 'CLOSED')
  assert.deepEqual(
    closed.actions.map((a) => a.actionType),
    ['KILL_SESSIONS', 'LOCK_STAFF'],
  )
})

// 사건 흐름도에 없는 경보 · 없는 직원이 나오면 안 된다
test('mockStaffCases_linkOnlyExistingStaffAlerts', () => {
  const now = new Date('2026-10-24T01:00:00Z')
  const alertIds = new Set(buildMockStaffAlerts(now).map((a) => a.staffHitId))
  const userIds = new Set(MOCK_USERS.map((u) => u.userId))
  const linked = new Set<number>()
  for (const c of buildMockStaffCases(now)) {
    assert.ok(c.staffHitIds.length > 0, c.caseId)
    for (const id of c.staffHitIds) {
      assert.ok(alertIds.has(id), `사건 ${c.caseId}의 경보 ${id}`)
      // 경보 1건은 사건 1개에만 (case_staff_hits UNIQUE)
      assert.ok(!linked.has(id), `경보 ${id} 중복 연결`)
      linked.add(id)
    }
    for (const id of c.subjectUserIds) assert.ok(userIds.has(id), `직원 ${id}`)
  }
})

// 감사 로그 순서가 섞이면 시간 흐름을 읽을 수 없다
test('mockAuditLogs_sortedNewestFirst', async () => {
  const isNewestFirst = (rows: { occurredAt: string }[]) =>
    rows.every((row, i) => i === 0 || rows[i - 1].occurredAt >= row.occurredAt)
  assert.ok(isNewestFirst(buildMockAuditLogs(new Date('2026-10-24T01:00:00Z'))))
  setMockActor(yunseo)
  await mockCreateApproval({
    requestType: 'BLOCKLIST_RELEASE',
    targetType: 'BLOCKLIST_ENTRY',
    targetId: 1,
    targetLabel: '차단 카드',
    reason: '테스트',
  })
  const rows = await mockGetAuditLogs()
  assert.ok(isNewestFirst(rows))
  assert.equal(rows[0].action, 'APPROVAL_REQUESTED')
})
