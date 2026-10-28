// P3 investigation API 계약 — 직원 사건 · 관리자 승인 · 감사 로그
// VITE_USE_MOCK에 investigation이 있으면 Mock, 없으면 실제 API를 쓴다
// 결제 사건 API는 api/cases.ts (팀 코드, 실제 API 연결)
import { api, ApiError } from './client.ts'
import {
  ApprovalClosedError,
  ApprovalDuplicateError,
  ApprovalForbiddenError,
  ApprovalTargetInvalidError,
  CaseActionForbiddenError,
  RejectReasonRequiredError,
  SelfApprovalError,
  StaffCaseForbiddenError,
} from './investigationErrors.ts'
import { isMock } from './mockMode.ts'
import {
  mockCreateApproval,
  mockDecideApproval,
  mockGetApprovals,
  mockGetAuditLogs,
  mockGetStaffCase,
  mockGetStaffCases,
  mockRequestCaseActions,
} from './mock/investigation.ts'
import type {
  ApprovalDecision,
  ApprovalRequest,
  ApprovalStatus,
  AuditLog,
  AuditLogQuery,
  NewApprovalRequest,
  NewCaseAction,
  StaffCase,
} from '../types/investigation.ts'

// 백엔드 오류 코드 → 화면용 오류 (INV_010 ~ INV_012 · INV_014는 2-9, INV_013 · INV_015 · INV_016은 2-10, INV_025는 2-7에서 백엔드에 추가)
function mapInvestigationError(error: unknown): never {
  if (error instanceof ApiError) {
    if (error.code === 'INV_010') throw new SelfApprovalError()
    if (error.code === 'INV_011') throw new CaseActionForbiddenError()
    if (error.code === 'INV_012') throw new ApprovalClosedError()
    if (error.code === 'INV_013') throw new ApprovalDuplicateError()
    if (error.code === 'INV_014') throw new StaffCaseForbiddenError()
    if (error.code === 'INV_015') throw new RejectReasonRequiredError()
    if (error.code === 'INV_016') throw new ApprovalForbiddenError()
    if (error.code === 'INV_025') throw new ApprovalTargetInvalidError()
  }
  throw error
}

const postJson = <T>(path: string, body: unknown) =>
  api<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(mapInvestigationError)

const realGetStaffCases = () => api<StaffCase[]>('/investigation/staff-cases')

async function realGetStaffCase(caseId: string) {
  try {
    return await api<StaffCase>(`/investigation/staff-cases/${caseId}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    mapInvestigationError(error)
  }
}

// 판정 사유는 감사 로그에 남는다
const realRequestCaseActions = (caseId: string, actions: NewCaseAction[], reason: string) =>
  postJson<StaffCase>(`/investigation/staff-cases/${caseId}/actions`, { actions, reason })

const realGetApprovals = (status?: ApprovalStatus) =>
  api<ApprovalRequest[]>(`/investigation/approvals${status ? `?status=${status}` : ''}`)

const realCreateApproval = (input: NewApprovalRequest) =>
  postJson<ApprovalRequest>('/investigation/approvals', input)

const realDecideApproval = (approvalId: number, decision: ApprovalDecision, comment: string) =>
  postJson<ApprovalRequest>(`/investigation/approvals/${approvalId}/decision`, {
    decision,
    comment,
  })

function realGetAuditLogs(query: AuditLogQuery = {}) {
  const params = new URLSearchParams()
  if (query.actorId !== undefined) params.set('actorId', String(query.actorId))
  if (query.action) params.set('action', query.action)
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  const suffix = params.size > 0 ? `?${params}` : ''
  return api<AuditLog[]>(`/investigation/audit-logs${suffix}`)
}

const mock = isMock('investigation')

// 직원 사건 목록 · 상세
export const getStaffCases = mock ? mockGetStaffCases : realGetStaffCases
export const getStaffCase = mock ? mockGetStaffCase : realGetStaffCase
// 직원 사건 조치 (보안 관리자만, 대상 직원 본인 불가)
export const requestCaseActions = mock ? mockRequestCaseActions : realRequestCaseActions
// 관리자 승인함
export const getApprovals = mock ? mockGetApprovals : realGetApprovals
// AI 권고 반대 판정 · Rule 끄기 · 기준 완화 · 차단 해제 요청
export const createApproval = mock ? mockCreateApproval : realCreateApproval
// 승인 · 거절 (요청자 본인 불가)
export const decideApproval = mock ? mockDecideApproval : realDecideApproval
// 감사 로그 (최신이 앞)
export const getAuditLogs = mock ? mockGetAuditLogs : realGetAuditLogs
