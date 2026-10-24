import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { CheckoutAlreadyPaidError, CheckoutExpiredError } from '../src/api/checkoutErrors.ts'
import {
  decideOutcome,
  DEMO_CARDS,
  mockGetCheckoutSession,
  mockPayCheckout,
  resetMockCheckout,
} from '../src/api/mock/checkout.ts'

beforeEach(() => resetMockCheckout())

// 구매자에게 점수 · 사유가 보이면 공격자가 탐지 기준을 알아낸다
const INTERNAL = /점수|\d+점|Rule|룰|FDS|AI|위험|REVIEW|DENY|HELD|보류/

test('checkoutResult_hidesScoreAndReason', async () => {
  for (const card of DEMO_CARDS) {
    resetMockCheckout()
    const result = await mockPayCheckout('demo-session-31', card.cardToken)
    assert.doesNotMatch(result.title + result.message, INTERNAL, card.cardToken)
    // CakeShop 결과 페이지는 화면 이동용 — 결제 번호 · 주문번호만 싣는다
    assert.match(result.returnUrl, /\?paymentId=31&orderRef=CS-20261024-0120$/)
  }
})

// HELD를 "결제 완료"로 보이면 사장님이 확인 전에 케이크를 만든다
test('checkingOutcome_isNotShownAsPaid', async () => {
  const result = await mockPayCheckout('demo-session-31', 'demo-card-new')
  assert.equal(result.outcome, 'CHECKING')
  assert.doesNotMatch(result.title, /완료/)
  assert.match(result.message, /본인 확인/)
})

// 시연 규칙: 고액 + 처음 쓰는 카드 → 확인 중, 고액 + 해외 카드 → 결제 불가, 소액은 결제 완료
test('decideOutcome_followsDemoRules', () => {
  assert.equal(decideOutcome('demo-card-usual', 650000), 'PAID')
  assert.equal(decideOutcome('demo-card-new', 650000), 'CHECKING')
  assert.equal(decideOutcome('demo-card-foreign', 890000), 'BLOCKED')
  assert.equal(decideOutcome('demo-card-new', 38000), 'PAID')
  assert.equal(decideOutcome('demo-card-foreign', 38000), 'PAID')
  assert.equal(decideOutcome('demo-card-decline', 38000), 'DECLINED')
})

// 같은 결제창으로 두 번 결제되면 이중 청구, 만료된 결제창은 열리면 안 된다
test('checkoutSession_payOnceAndExpire', async () => {
  const session = await mockGetCheckoutSession('demo-session-33')
  assert.equal(session.status, 'OPEN')
  assert.ok(!('paymentId' in session) && !('orderRef' in session))
  assert.match(session.buyerEmailMasked, /^\S\*\*\*@/)
  await mockPayCheckout('demo-session-33', 'demo-card-usual')
  await assert.rejects(
    mockPayCheckout('demo-session-33', 'demo-card-usual'),
    CheckoutAlreadyPaidError,
  )
  await assert.rejects(mockGetCheckoutSession('demo-session-old'), CheckoutExpiredError)
  await assert.rejects(mockPayCheckout('demo-session-old', 'demo-card-usual'), CheckoutExpiredError)
  await assert.rejects(mockGetCheckoutSession('no-such'), CheckoutExpiredError)
})

// 카드 번호 원문이 화면 · Mock에 남으면 안 된다
test('demoCards_haveNoCardNumbers', () => {
  for (const card of DEMO_CARDS) {
    assert.match(card.masked, /^\*{4} \d{4}$/)
    assert.doesNotMatch(JSON.stringify(card), /\d{5,}/)
  }
})
