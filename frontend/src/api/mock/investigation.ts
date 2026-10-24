// P3 investigation Mock — 직원 사건 · 2인 승인 · 감사 로그 (프로토타입 v3.1 시나리오)
// 0-2 로그인 기록 · 0-3 직원 경보 Mock과 같은 장면이다
// 테스트가 직접 불러오므로 import.meta.env를 읽는 mockMode는 쓰지 않는다
import {
  ApprovalClosedError,
  CaseActionForbiddenError,
  SelfApprovalError,
} from '../investigationErrors.ts'
import { mockRespond } from './respond.ts'
import type { AuthUser } from '../../types/auth.ts'
import type {
  ApprovalDecision,
  ApprovalRequest,
  ApprovalStatus,
  AuditLog,
  AuditLogQuery,
  CaseAction,
  NewApprovalRequest,
  NewCaseAction,
  StaffCase,
} from '../../types/investigation.ts'

type Actor = Pick<AuthUser, 'userId' | 'role' | 'displayName'>

// Mock에는 세션이 없으므로 "지금 로그인한 사람"을 여기서 정한다. 기본은 보안 관리자 최윤서
const MANAGER: Actor = { userId: 5, role: 'SECURITY_MANAGER', displayName: '최윤서' }
let actor: Actor = MANAGER

export function setMockActor(next: Actor) {
  actor = next
}

// 다른 Mock(보고서 등)이 같은 현재 사용자를 쓰도록 내보낸다
export const getMockActor = (): Actor => actor

const minutesAgo = (now: Date, minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString()
const minutesLater = (now: Date, minutes: number) =>
  new Date(now.getTime() + minutes * 60_000).toISOString()

// staffHitIds는 api/mock/fds.ts buildMockStaffAlerts의 staffHitId
export function buildMockStaffCases(now: Date): StaffCase[] {
  return [
    {
      caseId: '101',
      caseType: 'STAFF_TAKEOVER',
      status: 'DECISION_PENDING',
      subjectUserIds: [4],
      subjectLabel: '보안 직원 박지원 계정',
      staffHitIds: [1, 2, 3, 4],
      groupingBasis: '같은 직원 계정 · 24시간 창',
      createdAt: minutesAgo(now, 93),
      closedAt: null,
      actions: [],
    },
    {
      caseId: '102',
      caseType: 'STAFF_SPRAY',
      status: 'DECISION_PENDING',
      subjectUserIds: [4, 6],
      subjectLabel: '직원 계정 2개 (박지원 · 이도현)',
      staffHitIds: [5, 6],
      groupingBasis: '같은 공격 IP 묶음 · 10분 창 · IP 무관 계정 기준',
      createdAt: minutesAgo(now, 1),
      closedAt: null,
      actions: [],
    }, // 지난 사건 — 101 보고서의 비슷한 과거 사건
    {
      caseId: '91',
      caseType: 'STAFF_TAKEOVER',
      status: 'CLOSED',
      subjectUserIds: [4],
      subjectLabel: '보안 직원 박지원 계정',
      staffHitIds: [7],
      groupingBasis: '같은 직원 계정 · 24시간 창',
      createdAt: minutesAgo(now, 24 * 24 * 60),
      closedAt: minutesAgo(now, 24 * 24 * 60 - 120),
      actions: [],
    },
  ]
}

export function buildMockApprovals(now: Date): ApprovalRequest[] {
  const base = {
    payload: null,
    decidedBy: null,
    decidedAt: null,
    decisionComment: null,
    riskStaffHitIds: [],
  }
  return [
    {
      ...base,
      approvalId: 3,
      requestType: 'RULE_DISABLE',
      targetType: 'FDS_RULE',
      targetId: 2,
      targetLabel: '"고액 결제" Rule',
      payload: { enabled: false },
      reason: '단체 주문 오탐이 많아 잠시 끕니다',
      requestedBy: 4,
      requestedByName: '박지원',
      requestedAt: minutesAgo(now, 30),
      status: 'PENDING',
      expiresAt: minutesLater(now, 24 * 60 - 30),
      // 탈취 의심 세션(해외 Tor IP)에서 온 요청
      riskStaffHitIds: [3, 4],
    },
    {
      ...base,
      approvalId: 2,
      requestType: 'DECISION_OVERRIDE',
      targetType: 'PAYMENT_DECISION',
      targetId: 7,
      targetLabel: '결제 #7 · AI 권고 "취소 검토"와 반대로 매입 허용',
      payload: { decision: 'ACCEPT' },
      reason: '고객과 통화해 본인 결제임을 확인',
      requestedBy: 6,
      requestedByName: '이도현',
      requestedAt: minutesAgo(now, 180),
      status: 'PENDING',
      expiresAt: minutesLater(now, 24 * 60 - 180),
    },
    {
      ...base,
      approvalId: 1,
      requestType: 'BLOCKLIST_RELEASE',
      targetType: 'BLOCKLIST_ENTRY',
      targetId: 3,
      targetLabel: '차단 목록 IP 45.83.64.12',
      reason: '가맹점 사무실 VPN으로 확인되어 해제 요청',
      requestedBy: 6,
      requestedByName: '이도현',
      requestedAt: minutesAgo(now, 2 * 1440),
      status: 'REJECTED',
      decidedBy: 5,
      decidedAt: minutesAgo(now, 2 * 1440 - 20),
      decisionComment: '카드 테스팅 이력이 있는 대역이라 유지',
      expiresAt: minutesAgo(now, 1440),
    },
  ]
}

// 최신이 앞에 오도록 정렬해서 돌려준다
export function buildMockAuditLogs(now: Date): AuditLog[] {
  const rows: Omit<AuditLog, 'auditId'>[] = []
  const add = (
    minutes: number,
    actorId: number | null,
    actorName: string,
    action: string,
    target: [string, number] | null,
    clientIp: string | null,
    detail: Record<string, unknown> | null = null,
  ) =>
    rows.push({
      actorType: actorId === null ? 'SYSTEM' : 'STAFF',
      actorId,
      actorName,
      action,
      targetType: target?.[0] ?? null,
      targetId: target?.[1] ?? null,
      detail,
      clientIp,
      occurredAt: minutesAgo(now, minutes),
    })
  add(2 * 1440, 6, '이도현', 'APPROVAL_REQUESTED', ['APPROVAL_REQUEST', 1], '10.20.0.31')
  add(2 * 1440 - 20, 5, '최윤서', 'APPROVAL_REJECTED', ['APPROVAL_REQUEST', 1], '10.20.0.22')
  add(780, 4, '박지원', 'LOGIN_SUCCESS', null, '175.223.14.90', { newDevice: true })
  add(180, 6, '이도현', 'APPROVAL_REQUESTED', ['APPROVAL_REQUEST', 2], '10.20.0.31')
  add(120, 4, '박지원', 'LOGIN_SUCCESS', null, '10.20.0.15')
  add(93, 4, '박지원', 'LOGIN_OTP_FAILED', null, '185.220.101.7', { attempts: 3 })
  add(93, null, '시스템', 'CASE_CREATED', ['SECURITY_CASE', 101], null)
  add(40, 4, '박지원', 'SESSION_CONCURRENT', null, '185.220.101.7')
  add(30, 4, '박지원', 'APPROVAL_REQUESTED', ['APPROVAL_REQUEST', 3], '185.220.101.7', {
    rule: 'HIGH_AMOUNT',
  })
  add(1, null, '시스템', 'CASE_CREATED', ['SECURITY_CASE', 102], null)
  return rows
    .map((row, index) => ({ ...row, auditId: index + 1 }))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.auditId - a.auditId)
}

// 화면에서 바꾼 내용은 새로고침 전까지만 남는다
type MockState = {
  cases: StaffCase[]
  approvals: ApprovalRequest[]
  audit: AuditLog[]
  nextActionId: number
}
let state: MockState | null = null

function current(): MockState {
  if (!state) {
    const now = new Date()
    state = {
      cases: buildMockStaffCases(now),
      approvals: buildMockApprovals(now),
      audit: buildMockAuditLogs(now),
      nextActionId: 1,
    }
  }
  return state
}

// 테스트 · 시연 다시 시작용
export function resetMockInvestigation() {
  state = null
  actor = MANAGER
}

function audit(action: string, target: [string, number], detail: Record<string, unknown>) {
  const s = current()
  s.audit.unshift({
    auditId: s.audit.length + 1,
    actorType: 'STAFF',
    actorId: actor.userId,
    actorName: actor.displayName,
    action,
    targetType: target[0],
    targetId: target[1],
    detail,
    clientIp: null,
    occurredAt: new Date().toISOString(),
  })
}

export function mockGetStaffCases(): Promise<StaffCase[]> {
  return mockRespond(current().cases)
}

export function mockGetStaffCase(caseId: string): Promise<StaffCase | null> {
  return mockRespond(current().cases.find((c) => c.caseId === caseId) ?? null)
}

export async function mockRequestCaseActions(
  caseId: string,
  actions: NewCaseAction[],
): Promise<StaffCase> {
  await mockRespond(null)
  const found = current().cases.find((c) => c.caseId === caseId)
  if (!found) throw new Error(`사건 ${caseId}을 찾을 수 없습니다.`)
  // 직원 사건은 보안 관리자만, 대상 직원 본인은 불가 (직무 분리)
  if (actor.role !== 'SECURITY_MANAGER' || found.subjectUserIds.includes(actor.userId)) {
    throw new CaseActionForbiddenError()
  }
  const now = new Date().toISOString()
  const created: CaseAction[] = actions.map((a) => ({
    caseActionId: current().nextActionId++,
    caseId,
    actionType: a.actionType,
    targetRef: a.targetRef ?? null,
    status: 'DONE',
    requestedBy: actor.userId,
    requestedAt: now,
    completedAt: now,
    failureReason: null,
  }))
  found.actions.push(...created)
  found.status = 'CLOSED'
  found.closedAt = now
  audit('CASE_ACTIONS_REQUESTED', ['SECURITY_CASE', Number(caseId)], {
    actions: actions.map((a) => a.actionType),
  })
  return structuredClone(found)
}

export function mockGetApprovals(status?: ApprovalStatus): Promise<ApprovalRequest[]> {
  const rows = current().approvals.filter((a) => !status || a.status === status)
  return mockRespond(rows)
}

export async function mockCreateApproval(input: NewApprovalRequest): Promise<ApprovalRequest> {
  await mockRespond(null)
  const s = current()
  const now = new Date()
  const created: ApprovalRequest = {
    approvalId: Math.max(0, ...s.approvals.map((a) => a.approvalId)) + 1,
    requestType: input.requestType,
    targetType: input.targetType,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    payload: input.payload ?? null,
    reason: input.reason,
    requestedBy: actor.userId,
    requestedByName: actor.displayName,
    requestedAt: now.toISOString(),
    status: 'PENDING',
    decidedBy: null,
    decidedAt: null,
    decisionComment: null,
    expiresAt: minutesLater(now, 24 * 60),
    riskStaffHitIds: [],
  }
  s.approvals.unshift(created)
  audit('APPROVAL_REQUESTED', ['APPROVAL_REQUEST', created.approvalId], {
    requestType: input.requestType,
  })
  return structuredClone(created)
}

export async function mockDecideApproval(
  approvalId: number,
  decision: ApprovalDecision,
  comment: string,
): Promise<ApprovalRequest> {
  await mockRespond(null)
  const found = current().approvals.find((a) => a.approvalId === approvalId)
  if (!found || found.status !== 'PENDING') throw new ApprovalClosedError()
  // 2인 승인: 요청자 본인은 승인도 거절도 할 수 없다 (DB CHECK 제약과 같은 규칙)
  if (found.requestedBy === actor.userId) throw new SelfApprovalError()
  found.status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
  found.decidedBy = actor.userId
  found.decidedAt = new Date().toISOString()
  found.decisionComment = comment
  audit(
    decision === 'APPROVE' ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
    ['APPROVAL_REQUEST', approvalId],
    { comment },
  )
  return structuredClone(found)
}

export function mockGetAuditLogs(query: AuditLogQuery = {}): Promise<AuditLog[]> {
  const rows = current().audit.filter(
    (row) =>
      (query.actorId === undefined || row.actorId === query.actorId) &&
      (!query.action || row.action === query.action) &&
      (!query.from || row.occurredAt >= query.from) &&
      (!query.to || row.occurredAt <= query.to),
  )
  return mockRespond(rows)
}
