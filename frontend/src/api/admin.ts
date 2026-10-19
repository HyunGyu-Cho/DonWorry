import { request } from './client'

/** ADM-01~02 — 05-1 계약 */

export function listMerchants(params: { page?: number; size?: number }): Promise<unknown> {
  return request<unknown>('/api/admin/merchants', { query: params })
}

export function createMerchant(body: { merchantCode: string; name: string }): Promise<unknown> {
  return request<unknown>('/api/admin/merchants', { method: 'POST', body })
}

export function patchMerchant(id: number, body: { status: string }): Promise<unknown> {
  return request<unknown>(`/api/admin/merchants/${id}`, { method: 'PATCH', body })
}

export function listUsers(params: { page?: number; size?: number }): Promise<unknown> {
  return request<unknown>('/api/admin/users', { query: params })
}

export function createUser(body: {
  email: string
  role: string
  merchantId: number | null
}): Promise<unknown> {
  return request<unknown>('/api/admin/users', { method: 'POST', body })
}

export function patchUser(id: number, body: { status?: string; role?: string }): Promise<unknown> {
  return request<unknown>(`/api/admin/users/${id}`, { method: 'PATCH', body })
}
