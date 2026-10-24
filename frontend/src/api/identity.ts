// P1 identity API 계약 — 2단계 인증 로그인 · 직원 로그인 기록 · 접속 세션
// VITE_USE_MOCK에 identity가 있으면 Mock, 없으면 실제 API를 쓴다
// 로그인 화면은 1-1에서 login() 대신 startLogin()으로 바꾼다 (백엔드 2-1과 함께)
import { AccountLockedError, InvalidCredentialsError, InvalidOtpError } from './auth.ts'
import { api, ApiError } from './client.ts'
import { isMock } from './mockMode.ts'
import {
  mockGetLoginEvents,
  mockGetStaffSessions,
  mockStartLogin,
  mockSubmitRecoveryCode,
  mockVerifyOtp,
} from './mock/identity.ts'
import type {
  AuthUser,
  LoginEventQuery,
  LoginStep,
  StaffLoginEvent,
  StaffSession,
} from '../types/auth.ts'

// 백엔드 오류 코드 → 화면용 오류 (AUTH_010 · AUTH_011은 2-1에서 AuthErrorCode에 추가)
function mapAuthError(error: unknown): never {
  if (error instanceof ApiError) {
    if (error.code === 'AUTH_004') throw new InvalidCredentialsError()
    if (error.code === 'AUTH_010') throw new InvalidOtpError()
    if (error.code === 'AUTH_011') throw new AccountLockedError()
  }
  throw error
}

const postJson = <T>(path: string, body: unknown) =>
  api<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(mapAuthError)

const realStartLogin = (loginId: string, password: string) =>
  postJson<LoginStep>('/auth/login', { loginId, password })

const realVerifyOtp = (challengeId: string, code: string) =>
  postJson<AuthUser>('/auth/otp', { challengeId, code })

const realSubmitRecoveryCode = (challengeId: string, recoveryCode: string) =>
  postJson<AuthUser>('/auth/recovery-code', { challengeId, recoveryCode })

function realGetLoginEvents(query: LoginEventQuery = {}) {
  const params = new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])),
  )
  const suffix = params.size > 0 ? `?${params}` : ''
  return api<StaffLoginEvent[]>(`/identity/staff/login-events${suffix}`)
}

const realGetStaffSessions = (activeOnly = true) =>
  api<StaffSession[]>(`/identity/staff/sessions?active=${activeOnly}`)

const mock = isMock('identity')

// 1단계: 아이디 · 비밀번호. 직원이면 OTP_REQUIRED, 사장님이면 SUCCESS
export const startLogin = mock ? mockStartLogin : realStartLogin
// 2단계: 인증 앱의 6자리 코드
export const verifyOtp = mock ? mockVerifyOtp : realVerifyOtp
// OTP 기기를 잃었을 때 1회용 복구 코드
export const submitRecoveryCode = mock ? mockSubmitRecoveryCode : realSubmitRecoveryCode
// 직원 로그인 기록 (보안 직원 · 관리자 화면)
export const getLoginEvents = mock ? mockGetLoginEvents : realGetLoginEvents
// 직원 접속 세션 (기본: 진행 중인 것만)
export const getStaffSessions = mock ? mockGetStaffSessions : realGetStaffSessions
