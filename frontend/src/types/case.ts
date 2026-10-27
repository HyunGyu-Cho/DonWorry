/**
 * P3 Investigation 화면 타입. 이름·상태값은 Notion fds 정본(설계 3.3·3.9)을 camelCase로 옮긴 것.
 * API DTO 확정 전이므로 필드 구성은 백엔드 계약에 맞춰 바뀔 수 있다.
 */

import type { RuleCode } from './fds.ts'
import type { ConclusionReport } from './report.ts'

// ── 상태값 (설계 3.3) ──
export type FdsResult = 'ALLOW' | 'REVIEW' | 'DENY' | 'ERROR'
export type PaymentStatus =
  'PENDING' | 'DENIED' | 'DECLINED' | 'HELD' | 'CAPTURED' | 'VOIDED' | 'EXPIRED'
// APPROVAL_PENDING: AI 권고와 반대인 판정이 관리자 승인을 기다리는 중 (새 기획)
export type CaseStatus =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'DECISION_PENDING'
  | 'APPROVAL_PENDING'
  | 'ACTION_PENDING'
  | 'ACTION_FAILED'
  | 'CLOSED'
// 결제 사기 + 직원 계정 사건 2종 (새 기획, security_cases.case_type)
export type CaseType = 'PAYMENT_FRAUD' | 'STAFF_TAKEOVER' | 'STAFF_SPRAY'
// SUPERSEDED = 조사 중 새 정보가 와서 새 버전이 이어받음 (2-18) — 최신 버전은 늘 새 버전이라 화면 흐름은 그대로
export type ReportStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SUPERSEDED'
export type Decision = 'ACCEPT' | 'REJECT'
export type ActionType = 'CAPTURE' | 'VOID'
export type HandoffStatus = 'REQUESTED' | 'ACCEPTED' | 'FAILED'
export type CaseHistoryEventType =
  | 'CASE_CREATED'
  | 'PAYMENT_LINKED'
  | 'DECISION_CONFIRMED'
  | 'HANDOFF_REQUESTED'
  | 'HANDOFF_ACCEPTED'
  | 'HANDOFF_FAILED'
  /** CASE_CREATED · CASE_CLOSED 외의 상태 전이. eventData에 from · to (설계 3.9 ⑧) */
  | 'CASE_STATUS_CHANGED'
  | 'CASE_CLOSED'
  /** 구매자 본인 확인 응답. eventData에 paymentId · answer(MINE · NOT_MINE) (#82) */
  | 'BUYER_RESPONDED'

// ── 엔터티 (설계 3.9) ──
export type SecurityCase = {
  caseId: string
  merchantId: string
  customerRef: string
  caseType: CaseType
  status: CaseStatus
  evidenceVersion: number
  createdAt: string
  closedAt: string | null
  // 직원 사건의 대상 직원 (security_cases.subject_user_id). 결제 사건은 없음
  subjectUserId?: string | null
  // 화면용 대상 이름 (예: 김민수 고객) · "묶은 기준" 문장. 1-5 보강
  subjectLabel: string
  groupingBasis: string
}

/**
 * case_payment + 조회로 합친 P5 결제 정보·P2 FDS 평가.
 * P5·P2에서 조회하지 못하면 백엔드가 null로 보낸다 (추정값을 채우지 않는다). 화면은 '-'로 표시한다.
 */
export type CasePayment = {
  casePaymentId: string
  paymentId: string
  linkedAt: string
  amount: number | null
  paymentStatus: PaymentStatus | null
  requestedAt: string | null
  riskScore: number | null
  fdsResult: FdsResult | null
  ruleHits: string[]
  // 이 결제의 FDS 평가(경보) 번호 · 적중 Rule. 1-5 보강 — 흐름도 카드에서 경보 상세로 간다
  evaluationId: number | null
  hitRuleCodes: RuleCode[]
}

export type PaymentDecision = {
  decisionId: string
  casePaymentId: string
  staffId: string
  /** AI 보고서 3회 실패 후 수동 판정이면 null. */
  reportId: string | null
  decision: Decision
  reason: string
  decidedAt: string
}

export type ActionHandoff = {
  handoffId: string
  decisionId: string
  actionType: ActionType
  status: HandoffStatus
  targetOperationId: string | null
  requestedAt: string
  acceptedAt: string | null
  lastErrorCode: string | null
}

export type CaseHistory = {
  historyId: string
  caseId: string
  eventType: CaseHistoryEventType
  actorType: 'STAFF' | 'SYSTEM'
  actorId: string | null
  eventData: Record<string, string>
  createdAt: string
}

// ── AI 보고서 (기획 2.7 표준 구성) — report_body 키 표기는 P4와 확정 전 ──
export type AiRecommendation = 'ACCEPT_REVIEW' | 'REJECT_REVIEW' | 'NEEDS_CHECK'

export type ReportBody = {
  overview: {
    caseId: string
    merchantId: string
    customerRef: string
    paymentCount: number
    totalAmount: number
    caseCreatedAt: string
    investigatedAt: string
    reportVersion: number
  }
  summary: string[]
  paymentAnalyses: Array<{
    paymentId: string
    amount: number
    requestedAt: string
    riskScore: number | null
    ruleHits: string[]
    riskEvidence: string[]
    normalEvidence: string[]
    unknowns: string[]
    recommendation: AiRecommendation
  }>
  timeline: Array<{ at: string; event: string }>
  overallAnalysis: string[]
  additionalChecks: string[]
  recommendation: { summary: string; limitations: string[] }
  evidence: Array<{
    toolName: string
    source: string
    evidenceId: string
    retrievedAt: string
    dataVersion: string
  }>
}

export type AiReport = {
  reportId: string
  caseId: string
  reportVersion: number
  evidenceVersion: number
  status: ReportStatus
  // 옛 8개 절 형식(템플릿 작성기) 또는 결론 카드 형식(ai-server 결과, schemaVersion 2 · 2-17)
  reportBody: ReportBody | ConclusionReport | null
  createdAt: string
  completedAt: string | null
}

// ── 화면 조회·요청 모델 ──
export type CaseSummary = SecurityCase & {
  paymentCount: number
  /** 결제 정보를 하나라도 조회하지 못하면 null (일부 합계를 내보내지 않는다). */
  totalAmount: number | null
  maxRiskScore: number | null
  latestReportStatus: ReportStatus | null
  decidedCount: number
  // 묶인 결제들의 적중 Rule (중복 없이, 점수 큰 순). 1-5 보강
  hitRuleCodes: RuleCode[]
}

export type CaseDetail = {
  securityCase: SecurityCase
  payments: CasePayment[]
  reports: AiReport[]
  decisions: PaymentDecision[]
  handoffs: ActionHandoff[]
  history: CaseHistory[]
}

export type SubmitDecisionsRequest = {
  /** 직원이 화면에서 확인한 Case 증거 버전. 현재 버전과 다르면 거부된다 (설계 3.5). */
  evidenceVersion: number
  reportId: string | null
  decisions: Array<{ casePaymentId: string; decision: Decision; reason: string }>
  // AI 권고와 반대인 판정이 섞였을 때만 — 재인증 표 (1-5b)
  reauthToken?: string | null
}

// 판정 결과 (1-5b): 바로 반영됐는지, 권고 반대라 관리자 승인을 기다리는지 — 판단은 서버가 한다
export type SubmitDecisionsResult = {
  outcome: 'DECIDED' | 'APPROVAL_PENDING'
  approvalId: number | null
}

// 조치 센터 1행 (GET /security-cases/handoffs, 1-6 보강) — 사건 · 결제를 따로 부르지 않게 이름까지 담는다
export type HandoffRow = ActionHandoff & {
  caseId: string
  subjectLabel: string
  paymentId: string
  // 상품 이름 · 금액 (조회하지 못하면 null)
  paymentTitle: string | null
  amount: number | null
  // 실제 결제 상태 — 매입 · 취소가 끝났는지 (조치 "완료" 판단)
  paymentStatus: PaymentStatus | null
}
