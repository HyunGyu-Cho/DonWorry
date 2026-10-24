import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  buildForecast,
  buildMockBank,
  buildMockSettlements,
  buildMockTransfers,
  MOCK_LOAN_PRODUCTS,
} from '../src/api/mock/settlement.ts'
import { calendarStage, FORECAST_DAYS, kstDate, neededAmount } from '../src/config/settlement.ts'
import type { SettlementEntry } from '../src/types/settlement.ts'

// 한국 시간 10/24 오전 10시
const now = new Date('2026-10-24T01:00:00Z')
const forecastOf = (held: { amount: number }[] = [{ amount: 650000 }]) =>
  buildForecast(now, buildMockBank(now), buildMockSettlements(now), buildMockTransfers(now), held)

// 날마다 잔액이 이어지지 않으면 "임대료 날 부족" 같은 결론이 틀린다
test('forecast_balanceCarriesOverEachDay', () => {
  const f = forecastOf()
  assert.equal(f.days.length, FORECAST_DAYS)
  assert.equal(f.days[0].date, '2026-10-24')
  let prev = f.bank.balance
  for (const d of f.days) {
    assert.equal(d.balance, prev + d.inflow - d.outflow, d.date)
    prev = d.balance
  }
  assert.equal(f.totalInflow - f.totalOutflow, f.days.at(-1)!.balance - f.bank.balance)
})

// 시나리오 ③: 임대료가 나가는 날 처음으로 0원 아래가 된다
test('forecast_firstShortageOnRentDay', () => {
  const f = forecastOf()
  const rent = f.transfers.find((t) => t.category === 'RENT')!
  assert.equal(f.firstShortageDate, rent.date)
  assert.equal(f.minBalance, Math.min(...f.days.map((d) => d.balance)))
  assert.ok(f.minBalance < 0)
  assert.equal(f.neededAmount, neededAmount(f.minBalance))
  assert.equal(f.neededAmount % 100_000, 0)
  assert.ok(f.neededAmount >= -f.minBalance && f.neededAmount < -f.minBalance + 100_000)
})

// 필요 자금은 10만 원 단위로 올리고, 부족이 없으면 0이다
test('neededAmount_roundsUpTo100k', () => {
  assert.equal(neededAmount(0), 0)
  assert.equal(neededAmount(500), 0)
  assert.equal(neededAmount(-1), 100_000)
  assert.equal(neededAmount(-100_000), 100_000)
  assert.equal(neededAmount(-991_100), 1_000_000)
})

// 매입 보류 결제가 입금에 들어가면 실제로 없는 돈으로 잔액이 부풀려진다
test('forecast_heldPaymentsOnlyInCauses', () => {
  const withHeld = forecastOf([{ amount: 650000 }])
  const withoutHeld = forecastOf([])
  assert.deepEqual(withHeld.days, withoutHeld.days)
  assert.equal(withHeld.causes.heldPaymentCount, 1)
  assert.equal(withHeld.causes.heldAmount, 650000)
  // 완료된 정산은 다시 입금되지 않는다
  const ids = new Set(withHeld.days.flatMap((d) => d.settlementIds))
  for (const s of buildMockSettlements(now)) {
    if (s.status === 'COMPLETED') assert.ok(!ids.has(s.settlementId), s.settlementId)
  }
})

// 정산일 규칙이 72시간과 다르면 사장님이 돈 들어오는 날을 잘못 안다
test('settlementDates_follow72HourRule', () => {
  for (const s of buildMockSettlements(now)) {
    const stage = calendarStage(s)
    assert.equal(s.settlementAmount, s.grossAmount - s.feeAmount, s.settlementId)
    if (s.scheduledAt) {
      // 픽업 완료 → 확정, 확정일은 예상일보다 늦지 않다 (Mock은 예정대로 픽업)
      assert.ok(Date.parse(s.scheduledAt) - Date.parse(s.expectedAt) <= 0)
      assert.notEqual(stage, 'EXPECTED')
    } else {
      assert.equal(stage, 'EXPECTED')
      assert.equal(s.completedAt, null)
    }
    if (stage === 'COMPLETED') assert.ok(Date.parse(s.completedAt!) <= now.getTime())
  }
  const canceled: SettlementEntry = { ...buildMockSettlements(now)[0], status: 'CANCELED' }
  assert.equal(calendarStage(canceled), null)
  // 한국 시간 자정 경계
  assert.equal(kstDate('2026-10-24T14:59:59Z'), '2026-10-24')
  assert.equal(kstDate('2026-10-24T15:00:00Z'), '2026-10-25')
})

// 대출 상품 화면 값이 DB 시드와 다르면 금리 · 한도를 잘못 안내한다
test('mockLoanProducts_matchSeed', () => {
  const seed = readFileSync(
    new URL(
      '../../backend/src/main/resources/db/migration/V20261024_102019__seed_loan_products.sql',
      import.meta.url,
    ),
    'utf8',
  )
  const pattern =
    /\('([^']+)', '([^']+)', (\d+), ([\d.]+), ([\d.]+), (\d+), (\d+),\s*'([^']+)', (TRUE|FALSE), 'ACTIVE'\)/g
  const seeded = [...seed.matchAll(pattern)].map((m) => ({
    bankName: m[1],
    productName: m[2],
    maxLimitAmount: Number(m[3]),
    minRate: Number(m[4]),
    maxRate: Number(m[5]),
    minTermMonths: Number(m[6]),
    maxTermMonths: Number(m[7]),
    feature: m[8],
    recommended: m[9] === 'TRUE',
  }))
  assert.equal(seeded.length, 3)
  assert.deepEqual(
    MOCK_LOAN_PRODUCTS.map((p) => {
      const rest: Partial<typeof p> = { ...p }
      delete rest.loanProductId
      return rest
    }),
    seeded,
  )
})
