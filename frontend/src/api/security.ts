import type { CaseListRow, Decision, Page } from '../types'
import { request } from './client'

/** SEC-01 — GET /api/security/cases */
export function listCases(params: {
  caseStatus?: string
  page?: number
  size?: number
}): Promise<Page<CaseListRow>> {
  return request<Page<CaseListRow>>('/api/security/cases', { query: params })
}

/** SEC-02 — GET /api/security/cases/{caseId} 상세 합성 응답 */
export function getCase(caseId: number): Promise<unknown> {
  return request<unknown>(`/api/security/cases/${caseId}`)
}

/**
 * SEC-02 — POST /api/security/cases/{caseId}/decisions
 * DEC-03: 결제별 판정 1회. requestKey 로 중복 제출을 막는다.
 */
export function submitDecision(
  caseId: number,
  body: { paymentId: number; decision: Decision; reason: string; requestKey: string },
): Promise<unknown> {
  return request<unknown>(`/api/security/cases/${caseId}/decisions`, { method: 'POST', body })
}

/** SEC-03 — GET /api/security/login-events (수동 조치 API 는 1차 MVP 제외) */
export function listLoginEvents(params: { page?: number; size?: number }): Promise<unknown> {
  return request<unknown>('/api/security/login-events', { query: params })
}
