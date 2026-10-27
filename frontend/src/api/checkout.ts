// P5 결제창 API 계약 — 구매자가 CakeShop에서 넘어와 카드를 고르고 결제한다 (docs/payment/cakeshop-contract.md 4절)
// VITE_USE_MOCK에 payment가 있으면 Mock, 없으면 실제 API를 쓴다
// 로그인 없이 결제창 토큰으로만 접근한다. 금액은 CakeShop 서버의 결제 준비 요청에서만 정해진다
import { CheckoutAlreadyPaidError, CheckoutExpiredError } from './checkoutErrors.ts'
import { chosenDemoEnvironment, demoEnvironmentHeaders } from '../utils/demoEnvironment.ts'
import { api, ApiError } from './client.ts'
import {
  mockCreateTestOrder,
  mockGetCheckoutSession,
  mockGetDemoCards,
  mockGetTestProducts,
  mockPayCheckout,
} from './mock/checkout.ts'
import { isMock } from './mockMode.ts'
import type {
  CheckoutResult,
  CheckoutSession,
  DemoCard,
  TestOrder,
  TestProduct,
} from '../types/checkout.ts'

// PAY_022 결제창 만료 · 없음, PAY_023 이미 결제함 (2-29에서 백엔드 추가)
function mapCheckoutError(error: unknown): never {
  if (error instanceof ApiError) {
    if (error.code === 'PAY_022') throw new CheckoutExpiredError()
    if (error.code === 'PAY_023') throw new CheckoutAlreadyPaidError()
  }
  throw error
}

const path = (token: string) => `/checkout/${encodeURIComponent(token)}`

async function realGetCheckoutSession(token: string): Promise<CheckoutSession> {
  try {
    return await api<CheckoutSession>(path(token))
  } catch (error) {
    mapCheckoutError(error)
  }
}

async function realPayCheckout(token: string, cardToken: string): Promise<CheckoutResult> {
  try {
    return await api<CheckoutResult>(`${path(token)}/pay`, {
      method: 'POST',
      // 테스트 상점에서 고른 접속 환경 (#98, 서버는 시연 설정이 켜졌을 때만 믿는다)
      headers: {
        'Content-Type': 'application/json',
        ...demoEnvironmentHeaders(chosenDemoEnvironment()),
      },
      body: JSON.stringify({ cardToken }),
    })
  } catch (error) {
    mapCheckoutError(error)
  }
}

const realGetDemoCards = () => api<DemoCard[]>('/checkout/demo-cards')
// 테스트 상점 API는 2단계(2-29)에서 demo 프로필 전용으로 추가 — 서버가 가맹점 키로 결제 준비를 대신 부른다
const realGetTestProducts = () => api<TestProduct[]>('/demo/test-shop/products')
const realCreateTestOrder = (productId: string) =>
  api<TestOrder>('/demo/test-shop/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId }),
  })

const mock = isMock('payment')

// 결제창 화면 정보
export const getCheckoutSession = mock ? mockGetCheckoutSession : realGetCheckoutSession
// 결제 실행 → 결과 · CakeShop으로 돌아갈 주소
export const payCheckout = mock ? mockPayCheckout : realPayCheckout
// 시연용 모의 카드 목록 (demo 프로필 전용)
export const getDemoCards = mock ? mockGetDemoCards : realGetDemoCards
// 테스트 상점 상품 목록 (demo 프로필 전용)
export const getTestProducts = mock ? mockGetTestProducts : realGetTestProducts
// 테스트 주문 만들기 → 결제창 토큰 (demo 프로필 전용)
export const createTestOrder = mock ? mockCreateTestOrder : realCreateTestOrder
