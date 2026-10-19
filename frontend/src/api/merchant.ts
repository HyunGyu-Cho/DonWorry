import { request } from './client'

/** MER-01~05 — 05-1 계약. 응답 타입은 백엔드 DTO 확정 후 types/ 로 옮긴다. */

export function getDashboard(params: { from: string; to: string }): Promise<unknown> {
  return request<unknown>('/api/merchant/dashboard', { query: params })
}

export function listPayments(params: {
  status?: string
  page?: number
  size?: number
}): Promise<unknown> {
  return request<unknown>('/api/merchant/payments', { query: params })
}

export function getPayment(paymentId: number): Promise<unknown> {
  return request<unknown>(`/api/merchant/payments/${paymentId}`)
}

/** DEC-08: 승인 후 72시간 이내 전액 1회. requestKey 로 중복 환불을 막는다. */
export function requestRefund(body: {
  paymentId: number
  reason: string
  requestKey: string
}): Promise<unknown> {
  return request<unknown>('/api/merchant/refunds', { method: 'POST', body })
}

export function listSettlements(params: { page?: number; size?: number }): Promise<unknown> {
  return request<unknown>('/api/merchant/settlements', { query: params })
}

export function getSettlement(settlementId: number): Promise<unknown> {
  return request<unknown>(`/api/merchant/settlements/${settlementId}`)
}

export function getCashflow(): Promise<unknown> {
  return request<unknown>('/api/merchant/cashflow')
}

export function putCashflowAssumptions(body: {
  openingBalance: number
  baseDate: string
}): Promise<unknown> {
  return request<unknown>('/api/merchant/cashflow/assumptions', { method: 'PUT', body })
}

export function getFinanceOptions(): Promise<unknown> {
  return request<unknown>('/api/merchant/finance-options')
}
