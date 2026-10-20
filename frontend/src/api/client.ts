// 백엔드 호출 공통 — 주소·쿠키·에러 처리를 한 곳에서
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: 'include', ...init })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json() as Promise<T>
}
