// P5 결제 API 계약 — 결제 연동 필드 · 메일 발송 기록 · 사장님 보안 확인 결과 · 구매자 본인 확인
// VITE_USE_MOCK에 payment가 있으면 Mock, 없으면 실제 API를 쓴다
// 메일함 API는 없다 — 시연에서 메일은 Mailpit 화면(http://localhost:8025)에서 연다
import { api, ApiError } from './client.ts'
import { isMock } from './mockMode.ts'
import {
  mockAnswerBuyerConfirm,
  mockGetBuyerConfirmRequest,
  mockGetNotifications,
  mockGetOwnerResults,
  mockGetPaymentContext,
} from './mock/payment.ts'
import { ConfirmAlreadyAnsweredError, ConfirmLinkExpiredError } from './paymentErrors.ts'
import type {
  BuyerAnswer,
  BuyerConfirmation,
  BuyerConfirmRequest,
  Notification,
  NotificationQuery,
  OwnerPaymentResult,
  OwnerSecurityResult,
  PaymentContext,
} from '../types/payment.ts'

// PAY_010 링크 만료 · 없음, PAY_011 이미 응답함 (2-23 · 2-24에서 백엔드 추가)
function mapConfirmError(error: unknown): never {
  if (error instanceof ApiError) {
    if (error.code === 'PAY_010') throw new ConfirmLinkExpiredError()
    if (error.code === 'PAY_011') throw new ConfirmAlreadyAnsweredError()
  }
  throw error
}

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
  const text = search.toString()
  return text ? `?${text}` : ''
}

async function realGetPaymentContext(paymentId: string): Promise<PaymentContext | null> {
  try {
    return await api<PaymentContext>(`/payment/payments/${paymentId}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

const realGetNotifications = (q: NotificationQuery = {}) =>
  api<Notification[]>(`/payment/notifications${query(q)}`)

const realGetOwnerResults = (result?: OwnerSecurityResult) =>
  api<OwnerPaymentResult[]>(`/payment/owner/results${query({ result })}`)

// 공개 API — 로그인 없이 메일 속 링크 토큰으로만 접근
async function realGetBuyerConfirmRequest(token: string): Promise<BuyerConfirmRequest> {
  try {
    return await api<BuyerConfirmRequest>(
      `/public/buyer-confirmations/${encodeURIComponent(token)}`,
    )
  } catch (error) {
    mapConfirmError(error)
  }
}

async function realAnswerBuyerConfirm(
  token: string,
  answer: BuyerAnswer,
): Promise<BuyerConfirmation> {
  try {
    return await api<BuyerConfirmation>(
      `/public/buyer-confirmations/${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      },
    )
  } catch (error) {
    mapConfirmError(error)
  }
}

const mock = isMock('payment')

// 결제 + 구매자 연동 필드 (보안 직원 · 관리자). 없으면 null
export const getPaymentContext = mock ? mockGetPaymentContext : realGetPaymentContext
// 메일 발송 기록 (보안 직원 · 관리자)
export const getNotifications = mock ? mockGetNotifications : realGetNotifications
// 사장님 보안 확인 결과 (로그인한 가맹점 것만 — 백엔드가 거른다)
export const getOwnerResults = mock ? mockGetOwnerResults : realGetOwnerResults
// 구매자 본인 확인 페이지
export const getBuyerConfirmRequest = mock ? mockGetBuyerConfirmRequest : realGetBuyerConfirmRequest
export const answerBuyerConfirm = mock ? mockAnswerBuyerConfirm : realAnswerBuyerConfirm
