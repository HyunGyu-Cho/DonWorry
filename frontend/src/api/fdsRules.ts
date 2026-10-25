// P2 fds API 계약 — Rule 카탈로그(적중 통계 · 다시 켜기) · 차단 목록 · 직원 경보
// VITE_USE_MOCK에 fds가 있으면 Mock, 없으면 실제 API를 쓴다
// Rule 끄기 · 기준 완화 · 차단 해제는 담당자 승인 요청으로만 한다 (0-4)
import { api, ApiError } from './client.ts'
import { RuleActionForbiddenError, RuleAlreadyEnabledError } from './fdsErrors.ts'
import { isMock } from './mockMode.ts'
import {
  mockAddBlocklistEntry,
  mockEnableRule,
  mockGetBlocklist,
  mockGetRules,
  mockGetStaffAlerts,
} from './mock/fds.ts'
import { mockGetRuleHitStats } from './mock/fdsEvaluations.ts'
import type {
  BlocklistEntry,
  FdsRule,
  NewBlocklistEntry,
  RuleHitStat,
  StaffAlert,
  StaffAlertQuery,
} from '../types/fds.ts'

const realGetRules = () => api<FdsRule[]>('/fds/rules')

const realGetRuleHitStats = (days = 7) => api<RuleHitStat[]>(`/fds/rules/hit-stats?days=${days}`)

// 백엔드 오류 코드 → 화면용 오류 (FDS_010 · FDS_011은 2-7에서 백엔드에 추가)
const realEnableRule = (ruleId: number) =>
  api<FdsRule>(`/fds/rules/${ruleId}/enable`, { method: 'POST' }).catch((error: unknown) => {
    if (error instanceof ApiError && error.code === 'FDS_010') throw new RuleActionForbiddenError()
    if (error instanceof ApiError && error.code === 'FDS_011') throw new RuleAlreadyEnabledError()
    throw error
  })

const realGetBlocklist = (activeOnly = true) =>
  api<BlocklistEntry[]>(`/fds/blocklist?active=${activeOnly}`)

const realAddBlocklistEntry = (input: NewBlocklistEntry) =>
  api<BlocklistEntry>('/fds/blocklist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

function realGetStaffAlerts(query: StaffAlertQuery = {}) {
  const params = new URLSearchParams()
  if (query.userId !== undefined) params.set('userId', String(query.userId))
  if (query.from) params.set('from', query.from)
  if (query.severity) params.set('severity', query.severity)
  const suffix = params.size > 0 ? `?${params}` : ''
  return api<StaffAlert[]>(`/fds/staff-alerts${suffix}`)
}

const mock = isMock('fds')

// Rule 카탈로그 (결제 8 · 직원 7)
export const getRules = mock ? mockGetRules : realGetRules
// Rule별 최근 적중 수 (기본 7일, 한국 시간 날짜)
export const getRuleHitStats = mock ? mockGetRuleHitStats : realGetRuleHitStats
// Rule 다시 켜기 — 승인 없이 바로 반영. 끄기는 담당자 승인 요청(createApproval)으로만
export const enableRule = mock ? mockEnableRule : realEnableRule
// 차단 목록 (기본: 해제되지 않은 것만)
export const getBlocklist = mock ? mockGetBlocklist : realGetBlocklist
// 차단 목록 직접 등록 (보안 직원)
export const addBlocklistEntry = mock ? mockAddBlocklistEntry : realAddBlocklistEntry
// 직원 경보 (직원 Rule 적중)
export const getStaffAlerts = mock ? mockGetStaffAlerts : realGetStaffAlerts
