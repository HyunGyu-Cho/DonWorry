/**
 * 화면 간 공유 타입. 요청·응답 계약 정본은 Notion 05-1 이다.
 * 여기서는 05-1 에 적힌 필드만 옮기고, 화면 전용 파생 타입은 각 페이지에 둔다.
 */

/** DEC-13: 단일 역할 */
export type Role = 'PLATFORM_ADMIN' | 'SECURITY_STAFF' | 'MERCHANT_OWNER'

/** GET /api/auth/me */
export interface CurrentUser {
  userId: number
  email: string
  role: Role
  merchantId: number | null
}

/** 05-1 공통 오류 응답 */
export interface ApiErrorBody {
  code: string
  message: string
  requestId: string
  timestamp: string
}

/** 05-1 공통 페이징 */
export interface Page<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
}

export type CaseStatus = 'OPEN' | 'INVESTIGATING' | 'CLOSED'
export type ReportStatus = 'PENDING' | 'COMPLETED' | 'FAILED'
export type Decision = 'REJECT' | 'RELEASE'

/** SEC-01 목록 행 (05-1 합성 응답) */
export interface CaseListRow {
  caseId: number
  merchantId: number
  subjectLabel: string
  caseStatus: CaseStatus
  riskScore: number
  alertCount: number
  heldPaymentCount: number
  heldAmount: number
  reportStatus: ReportStatus | null
  updatedAt: string
}
