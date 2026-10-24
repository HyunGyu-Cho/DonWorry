// P2 fds API 계약 — Rule 카탈로그 · 차단 목록 · 직원 경보
// VITE_USE_MOCK에 fds가 있으면 Mock, 없으면 실제 API를 쓴다
// Rule 끄기 · 기준 완화 · 차단 해제는 2인 승인 요청으로만 한다 (0-4)
import { api } from './client.ts'
import { isMock } from './mockMode.ts'
import {
  mockAddBlocklistEntry,
  mockGetBlocklist,
  mockGetRules,
  mockGetStaffAlerts,
} from './mock/fds.ts'
import type {
  BlocklistEntry,
  FdsRule,
  NewBlocklistEntry,
  StaffAlert,
  StaffAlertQuery,
} from '../types/fds.ts'

const realGetRules = () => api<FdsRule[]>('/fds/rules')

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
// 차단 목록 (기본: 해제되지 않은 것만)
export const getBlocklist = mock ? mockGetBlocklist : realGetBlocklist
// 차단 목록 직접 등록 (보안 직원)
export const addBlocklistEntry = mock ? mockAddBlocklistEntry : realAddBlocklistEntry
// 직원 경보 (직원 Rule 적중)
export const getStaffAlerts = mock ? mockGetStaffAlerts : realGetStaffAlerts
