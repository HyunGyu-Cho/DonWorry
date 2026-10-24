import { api, ApiError } from './client.ts'
import type { AuthUser } from '../types/auth.ts'

export class InvalidCredentialsError extends Error {
  constructor() {
    super('아이디 또는 비밀번호가 올바르지 않습니다.')
    this.name = 'InvalidCredentialsError'
  }
}

// 2단계 인증 코드 · 복구 코드가 틀렸거나 인증 요청이 만료됨
export class InvalidOtpError extends Error {
  constructor() {
    super('인증 코드가 올바르지 않거나 만료되었습니다.')
    this.name = 'InvalidOtpError'
  }
}

// 로그인 실패가 반복되어 잠긴 계정
export class AccountLockedError extends Error {
  constructor() {
    super('로그인 실패가 반복되어 계정이 잠겼습니다. 보안 관리자에게 문의하세요.')
    this.name = 'AccountLockedError'
  }
}

export async function login(loginId: string, password: string): Promise<AuthUser> {
  try {
    return await api<AuthUser>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, password }),
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && error.code === 'AUTH_004') {
      throw new InvalidCredentialsError()
    }
    throw error
  }
}

export const getMe = () => api<AuthUser>('/auth/me', { cache: 'no-store' })
export const logout = () => api<void>('/auth/logout', { method: 'POST' })
