import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import {
  DEMO_CARDS,
  mockCreateTestOrder,
  mockGetCheckoutSession,
  mockGetTestProducts,
  mockPayCheckout,
  resetMockCheckout,
} from '../src/api/mock/checkout.ts'
import { CheckoutAlreadyPaidError } from '../src/api/checkoutErrors.ts'
import {
  CARD_GUIDE,
  checkoutExpiresText,
  OUTCOME_VIEW,
  returnTarget,
} from '../src/utils/checkoutView.ts'

beforeEach(() => resetMockCheckout())

const now = new Date('2026-10-24T03:00:00Z')
const INTERNAL = /점수|\d+점|Rule|룰|FDS|AI|위험|REVIEW|DENY|HELD|보류/

// 결제 완료가 아닌 결과를 "청구됨"으로 말하면 구매자가 오해한다
test('outcomeView_chargeTextMatchesOutcome', () => {
  assert.match(OUTCOME_VIEW.PAID.charge, /청구됐어요/)
  assert.match(OUTCOME_VIEW.BLOCKED.charge, /청구되지 않았어요/)
  assert.match(OUTCOME_VIEW.DECLINED.charge, /청구되지 않았어요/)
  for (const v of Object.values(OUTCOME_VIEW)) assert.doesNotMatch(v.charge, INTERNAL)
})

test('cardGuide_coversEveryDemoCard', () => {
  assert.deepEqual(
    CARD_GUIDE.map((g) => g.label),
    DEMO_CARDS.map((c) => c.label),
  )
})

test('checkoutExpiresText_minutes', () => {
  const in14 = new Date(now.getTime() + 14.5 * 60_000).toISOString()
  assert.equal(checkoutExpiresText(in14, now), '이 결제창은 14분 뒤 닫혀요')
  assert.equal(checkoutExpiresText(now.toISOString(), now), '이 결제창은 곧 닫혀요')
})

test('returnTarget_internalOnlyForOurPaths', () => {
  assert.equal(returnTarget('/demo/shop/result?paymentId=31').internal, true)
  assert.equal(returnTarget('http://localhost:8080/orders/result').internal, false)
})

// 테스트 상점은 같은 상품을 다른 카드로 다시 해 볼 수 있어야 시연이 된다
test('testOrder_canRetrySameProduct_andReturnsToTestShop', async () => {
  const [product] = await mockGetTestProducts()
  const first = await mockCreateTestOrder(product.productId)
  const paid = await mockPayCheckout(first.sessionToken, 'demo-card-new')
  assert.equal(paid.outcome, 'PAID')
  assert.match(paid.returnUrl, /^\/demo\/shop\/result\?/)
  await assert.rejects(
    mockPayCheckout(first.sessionToken, 'demo-card-usual'),
    CheckoutAlreadyPaidError,
  )
  const again = await mockCreateTestOrder(product.productId)
  assert.equal((await mockGetCheckoutSession(again.sessionToken)).status, 'OPEN')
  assert.equal((await mockPayCheckout(again.sessionToken, 'demo-card-foreign')).outcome, 'BLOCKED')
})

// CakeShop에서 온 결제창은 CakeShop으로 돌아간다
test('cakeShopSession_returnsToCakeShop', async () => {
  const result = await mockPayCheckout('demo-session-33', 'demo-card-usual')
  assert.match(result.returnUrl, /^http:\/\/localhost:8080\/orders\/result\?/)
})
