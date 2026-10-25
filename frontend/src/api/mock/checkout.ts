// P5 결제창 Mock — 프로토타입 v4.2 결제창 (모의 카드 4장)
// 결과 규칙은 시연용: 처음 쓰는 카드 + 50만 원 이상 → 확인 중, 해외 카드 + 50만 원 이상 → 결제 불가, 거절 카드 → 카드사 거절
// 실제 결과는 백엔드 FDS · 모의 승인기가 정한다 (2-29)
// 테스트가 직접 불러오므로 import.meta.env를 읽는 mockMode는 쓰지 않는다
import { CheckoutAlreadyPaidError, CheckoutExpiredError } from '../checkoutErrors.ts'
import { mockRespond } from './respond.ts'
import type {
  CheckoutOutcome,
  CheckoutResult,
  CheckoutSession,
  DemoCard,
  TestOrder,
  TestProduct,
} from '../../types/checkout.ts'

export const DEMO_CARDS: DemoCard[] = [
  { cardToken: 'demo-card-usual', label: '자주 쓰는 카드', masked: '**** 4821', country: 'KR' },
  { cardToken: 'demo-card-new', label: '처음 쓰는 카드', masked: '**** 1173', country: 'KR' },
  { cardToken: 'demo-card-foreign', label: '해외 발급 카드', masked: '**** 4402', country: 'US' },
  { cardToken: 'demo-card-decline', label: '한도 초과 카드', masked: '**** 0007', country: 'KR' },
]

const HIGH_AMOUNT = 500_000
const RETURN_URL = 'http://localhost:8080/orders/result'

type MockSession = CheckoutSession & { paymentId: string; orderRef: string }

// [토큰, 결제 번호, 주문번호, 주문 이름, 금액, 구매자, 만료까지(분)]
const SEEDS: [string, string, string, string, number, string, number][] = [
  ['demo-session-31', '31', 'CS-20261024-0120', '단체 행사용 케이크 세트', 650000, '김민수', 15],
  ['demo-session-33', '33', 'CS-20261024-0122', '딸기 생크림 케이크', 38000, '이서연', 15],
  ['demo-session-old', '30', 'CS-20261024-0119', '초코 케이크', 45000, '박지훈', -1],
]

const paid = new Map<string, CheckoutResult>()
// 테스트 상점에서 만든 결제창 — 돌아갈 곳이 CakeShop이 아니라 테스트 상점 결과 화면
const testOrders = new Set<string>()
const TEST_SHOP_RETURN = '/demo/shop/result'

export function resetMockCheckout() {
  paid.clear()
  testOrders.clear()
}

// 테스트 상점 상품 — 결제창 토큰은 Mock 시드를 다시 쓴다
const TEST_PRODUCTS: (TestProduct & { seedToken: string })[] = [
  {
    productId: 'cake-set',
    title: '단체 행사용 케이크 세트',
    amount: 650000,
    note: '고액 주문',
    seedToken: 'demo-session-31',
  },
  {
    productId: 'strawberry',
    title: '딸기 생크림 케이크',
    amount: 38000,
    note: '평범한 주문',
    seedToken: 'demo-session-33',
  },
]

const maskEmail = (name: string) => `${name.slice(0, 1)}***@example.com`

function findSession(token: string, now: Date): MockSession {
  const seed = SEEDS.find((s) => s[0] === token)
  if (!seed) throw new CheckoutExpiredError()
  const [, paymentId, orderRef, orderTitle, amount, buyerName, minutes] = seed
  const expiresAt = new Date(now.getTime() + minutes * 60_000).toISOString()
  return {
    paymentId,
    orderRef,
    merchantName: 'CakeShop',
    orderTitle,
    amount,
    buyerName,
    buyerEmailMasked: maskEmail(buyerName),
    expiresAt,
    status: paid.has(token) ? 'PAID' : minutes <= 0 ? 'EXPIRED' : 'OPEN',
  }
}

// 구매자 안내 — 점수 · 사유는 쓰지 않고 청구 여부와 다음에 할 일만
const COPY: Record<CheckoutOutcome, [string, string]> = {
  PAID: ['결제가 완료되었습니다', '주문이 확정되었습니다. CakeShop에서 픽업 일정을 확인해 주세요.'],
  CHECKING: [
    '결제를 확인하고 있습니다',
    '카드 승인은 완료되었고, 안전 확인 후 최종 처리됩니다. 이메일로 본인 확인 요청을 보냈습니다.',
  ],
  BLOCKED: [
    '결제를 진행할 수 없습니다',
    '카드에 청구되지 않았습니다. 다른 결제 수단을 이용하시거나 CakeShop 고객센터로 문의해 주세요.',
  ],
  DECLINED: [
    '카드사에서 승인하지 않았습니다',
    '카드에 청구되지 않았습니다. 카드사에 문의하시거나 다른 카드로 결제해 주세요.',
  ],
}

export function decideOutcome(cardToken: string, amount: number): CheckoutOutcome {
  if (cardToken === 'demo-card-decline') return 'DECLINED'
  if (amount >= HIGH_AMOUNT && cardToken === 'demo-card-foreign') return 'BLOCKED'
  if (amount >= HIGH_AMOUNT && cardToken === 'demo-card-new') return 'CHECKING'
  return 'PAID'
}

export async function mockGetCheckoutSession(token: string): Promise<CheckoutSession> {
  const session = findSession(token, new Date())
  if (session.status === 'EXPIRED') throw new CheckoutExpiredError()
  // 결제 번호 · 주문번호는 결제창 화면에 보내지 않는다
  const view: CheckoutSession = {
    merchantName: session.merchantName,
    orderTitle: session.orderTitle,
    amount: session.amount,
    buyerName: session.buyerName,
    buyerEmailMasked: session.buyerEmailMasked,
    expiresAt: session.expiresAt,
    status: session.status,
  }
  return mockRespond(view)
}

export async function mockPayCheckout(token: string, cardToken: string): Promise<CheckoutResult> {
  const session = findSession(token, new Date())
  if (session.status === 'PAID') throw new CheckoutAlreadyPaidError()
  if (session.status === 'EXPIRED') throw new CheckoutExpiredError()
  const outcome = decideOutcome(cardToken, session.amount)
  const [title, message] = COPY[outcome]
  const result: CheckoutResult = {
    paymentId: session.paymentId,
    outcome,
    title,
    message,
    returnUrl: `${testOrders.has(token) ? TEST_SHOP_RETURN : RETURN_URL}?paymentId=${session.paymentId}&orderRef=${session.orderRef}`,
  }
  paid.set(token, result)
  // 처리 중 화면을 볼 수 있게 조금 늦게 돌려준다
  return mockRespond(result, 1200)
}

export function mockGetDemoCards(): Promise<DemoCard[]> {
  return mockRespond(DEMO_CARDS)
}

export function mockGetTestProducts(): Promise<TestProduct[]> {
  return mockRespond(
    TEST_PRODUCTS.map((p) => ({
      productId: p.productId,
      title: p.title,
      amount: p.amount,
      note: p.note,
    })),
  )
}

// 테스트 주문 만들기 — 같은 상품을 다른 카드로 여러 번 해 볼 수 있게 결제 기록을 지운다
export async function mockCreateTestOrder(productId: string): Promise<TestOrder> {
  const product = TEST_PRODUCTS.find((p) => p.productId === productId)
  if (!product) throw new CheckoutExpiredError()
  paid.delete(product.seedToken)
  testOrders.add(product.seedToken)
  return mockRespond({ sessionToken: product.seedToken })
}
