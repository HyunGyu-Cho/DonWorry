// P3 investigation 계약 — 직원 사건 · 직원 사건 조치 · 2인 승인 · 감사 로그
// 값은 security_cases · case_actions · approval_requests · audit_logs와 같은 문자열 (docs/erd 7절)
// 결제 사건 타입은 types/case.ts (팀 코드, 실제 API 연결)
import type { CaseStatus } from './case.ts'

export type StaffCaseType = 'STAFF_TAKEOVER' | 'STAFF_SPRAY'

// 직원 사건 조치 (case_actions.action_type). 판정은 보안 관리자만 한다
export type CaseActionType =
  | 'KILL_SESSIONS'
  | 'LOCK_STAFF'
  | 'RESET_MFA'
  | 'BLOCK_IPS'
  | 'FORCE_PW'
  | 'WATCH'
  | 'REJECT_PENDING'
  | 'REVIEW_DECISIONS'
  | 'CLEAR_FLAG'
export type CaseActionStatus = 'REQUESTED' | 'DONE' | 'FAILED'

export type CaseAction = {
  caseActionId: number
  caseId: string
  actionType: CaseActionType
  targetRef: string | null
  status: CaseActionStatus
  requestedBy: number
  requestedAt: string
  completedAt: string | null
  failureReason: string | null
}

export type NewCaseAction = {
  actionType: CaseActionType
  targetRef?: string
}

// 직원 사건. 분산 공격(STAFF_SPRAY)은 대상 직원이 여러 명일 수 있다
export type StaffCase = {
  caseId: string
  caseType: StaffCaseType
  status: CaseStatus
  subjectUserIds: number[]
  subjectLabel: string
  // 묶인 직원 경보 (case_staff_hits → staff_rule_hits)
  staffHitIds: number[]
  // 화면 "묶은 기준" 문장
  groupingBasis: string
  createdAt: string
  closedAt: string | null
  actions: CaseAction[]
}

// 2인 승인 요청 (approval_requests)
export type ApprovalRequestType =
  'DECISION_OVERRIDE' | 'RULE_DISABLE' | 'RULE_THRESHOLD' | 'BLOCKLIST_RELEASE'
export type ApprovalTargetType = 'PAYMENT_DECISION' | 'FDS_RULE' | 'BLOCKLIST_ENTRY'
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
export type ApprovalDecision = 'APPROVE' | 'REJECT'

export type ApprovalRequest = {
  approvalId: number
  requestType: ApprovalRequestType
  targetType: ApprovalTargetType
  targetId: number
  // 화면 표시용 대상 이름, 예: "고액 결제" Rule
  targetLabel: string
  payload: Record<string, unknown> | null
  reason: string
  requestedBy: number
  requestedByName: string
  requestedAt: string
  status: ApprovalStatus
  decidedBy: number | null
  decidedAt: string | null
  decisionComment: string | null
  expiresAt: string
  // 요청 시점에 걸린 직원 경보 (예: 탈취 의심 세션에서 온 요청). 승인함에 위험 표시
  riskStaffHitIds: number[]
}

export type NewApprovalRequest = {
  requestType: ApprovalRequestType
  targetType: ApprovalTargetType
  targetId: number
  targetLabel: string
  payload?: Record<string, unknown>
  reason: string
}

// 감사 로그 (audit_logs). 수정 · 삭제 없음
export type AuditActorType = 'STAFF' | 'SYSTEM' | 'AI'

export type AuditLog = {
  auditId: number
  actorType: AuditActorType
  actorId: number | null
  actorName: string
  action: string
  targetType: string | null
  targetId: number | null
  detail: Record<string, unknown> | null
  clientIp: string | null
  occurredAt: string
}

export type AuditLogQuery = {
  actorId?: number
  action?: string
  from?: string
  to?: string
}
