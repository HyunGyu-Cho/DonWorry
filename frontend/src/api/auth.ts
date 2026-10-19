import type { CurrentUser } from '../types'
import { request } from './client'

/** AUTH-01 — 05-1 계약 */
export function login(email: string, password: string): Promise<CurrentUser> {
  return request<CurrentUser>('/api/auth/login', { method: 'POST', body: { email, password } })
}

export function me(): Promise<CurrentUser> {
  return request<CurrentUser>('/api/auth/me')
}

export function logout(): Promise<void> {
  return request<void>('/api/auth/logout', { method: 'POST' })
}
