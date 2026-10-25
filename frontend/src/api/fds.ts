// P2 결제 평가(경보) API — VITE_USE_MOCK에 fds가 있으면 Mock, 없으면 실제 API
// 타입은 types/fds.ts (기존 화면을 위해 여기서 다시 내보낸다)
import { api, ApiError } from './client'
import { isMock } from './mockMode'
import { mockGetFdsEvaluation, mockGetFdsEvaluations } from './mock/fdsEvaluations'
import type {
  FdsEvaluationDetail,
  FdsEvaluationPage,
  FdsEvaluationQuery,
  FdsResult,
} from '../types/fds'

export type {
  FdsEvaluationDetail,
  FdsEvaluationPage,
  FdsEvaluationQuery,
  FdsEvaluationSummary,
  FdsResult,
  FdsRuleHit,
  FdsRuleHitOutcome,
} from '../types/fds'

type FdsEvaluationResponse = {
  evaluationRequestId: string
  evaluationId: number
  result: FdsResult
  riskScore: number | null
  evaluatedAt: string
  errorCode: string | null
}

function realGetFdsEvaluations({
  result,
  attentionOnly = false,
  search,
  page = 0,
  size = 10,
}: FdsEvaluationQuery = {}) {
  const query = new URLSearchParams({ page: String(page), size: String(size) })
  if (result) query.set('result', result)
  if (attentionOnly) query.set('attentionOnly', 'true')
  if (search?.trim()) query.set('search', search.trim())
  return api<FdsEvaluationPage>(`/fds/evaluations?${query}`)
}

async function realGetFdsEvaluation(evaluationId: string) {
  try {
    return await api<FdsEvaluationDetail>(`/fds/evaluations/${evaluationId}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

const mock = isMock('fds')

// 결제 경보 목록 (attentionOnly = REVIEW · DENY · ERROR만)
export const getFdsEvaluations = mock ? mockGetFdsEvaluations : realGetFdsEvaluations
// 경보 상세 — Rule별 점수 · 같은 고객 이전 평가. 없으면 null
export const getFdsEvaluation = mock ? mockGetFdsEvaluation : realGetFdsEvaluation

// 실제 백엔드에 시험용 평가를 만든다 (Mock 모드에서는 쓰지 않는다)
export function createMockFdsEvaluations() {
  return api<FdsEvaluationResponse[]>('/fds/evaluations/mock', { method: 'POST' })
}
