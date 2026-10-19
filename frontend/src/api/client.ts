import type { ApiErrorBody } from '../types'

/**
 * 02-2: 모든 HTTP 호출은 이 파일을 통한다. 화면 안에서 직접 fetch 하지 않는다.
 * 06-4: 백엔드 주소는 환경변수로 관리한다.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8081'

/** 05-1 오류 정책: 400 / 401 / 403 / 404 / 409 / 422 / 500 / 503 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | null

  constructor(status: number, code: string, message: string, requestId: string | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  signal?: AbortSignal
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const url = new URL(path, BASE_URL)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options

  const response = await fetch(buildUrl(path, query), {
    method,
    signal,
    // 인증은 서버가 발행한 세션/토큰을 쿠키로 주고받는다고 가정한다.
    // 토큰 전달 방식이 05-1 에서 확정되면 이 한 곳만 바꾼다.
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    throw await toApiError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = `HTTP_${response.status}`
  let message = response.statusText
  let requestId: string | null = null

  try {
    const parsed = (await response.json()) as Partial<ApiErrorBody>
    if (parsed.code) code = parsed.code
    if (parsed.message) message = parsed.message
    if (parsed.requestId) requestId = parsed.requestId
  } catch {
    // 오류 본문이 JSON 이 아닌 경우는 상태 코드만 쓴다.
  }

  return new ApiError(response.status, code, message, requestId)
}
