import assert from 'node:assert/strict'
import { test } from 'node:test'
import { kstDate } from '../src/config/settlement.ts'
import {
  buildForecast,
  buildMockBank,
  buildMockSettlements,
  buildMockTransfers,
  MOCK_LOAN_PRODUCTS,
} from '../src/api/mock/settlement.ts'
import {
  balanceBars,
  busiestDay,
  daySummary,
  filterDayItems,
  calendarItems,
  coversNeed,
  monthDay,
  monthSummary,
  rateText,
  shortageText,
  sortLoans,
  termText,
} from '../src/utils/settlementView.ts'

const now = new Date('2026-10-25T03:00:00Z')
const today = kstDate(now)
const settlements = buildMockSettlements(now)
const transfers = buildMockTransfers(now)
const forecast = buildForecast(now, buildMockBank(now), settlements, transfers, [
  { amount: 650000 },
])

test('calendarItems_putsEverySettlementAndTransfer', () => {
  const items = calendarItems(settlements, transfers)
  const all = [...items.values()].flat()
  assert.equal(all.length, settlements.length + transfers.length)
  // 정산 칸은 사장님이 받는 돈(수수료 뺀 금액)
  const first = all.find((i) => i.key === 's1')!
  assert.equal(first.amount, settlements[0].settlementAmount)
  assert.deepEqual(
    new Set(all.map((i) => i.stage)),
    new Set(['COMPLETED', 'SCHEDULED', 'EXPECTED', 'OUTFLOW']),
  )
})

test('calendarItems_skipsCanceled', () => {
  const canceled = { ...settlements[0], status: 'CANCELED' as const }
  assert.equal(calendarItems([canceled], []).size, 0)
})

test('monthSummary_splitsByStage', () => {
  const items = calendarItems(settlements, transfers)
  const months = new Set([...items.keys()].map((d) => d.slice(0, 7)))
  let received = 0
  let outflow = 0
  for (const m of months) {
    const s = monthSummary(items, m)
    received += s.received
    outflow += s.outflow
  }
  assert.equal(
    outflow,
    transfers.reduce((n, t) => n + t.amount, 0),
  )
  assert.equal(
    received,
    settlements.filter((s) => s.status === 'COMPLETED').reduce((n, s) => n + s.settlementAmount, 0),
  )
})

// 시나리오 ③: 임대료 날(5일 뒤) 처음 모자란다
test('shortageText_namesTheDayAndTransfer', () => {
  const text = shortageText(forecast, today)!
  assert.match(text, /^5일 뒤\(\d+월 \d+일\) 매장 임대료 날 잔액이 .+ 모자라요$/)
  assert.equal(shortageText({ ...forecast, firstShortageDate: null }, today), null)
})

test('balanceBars_zeroLineAndNegativeBars', () => {
  const { zeroPct, bars } = balanceBars(forecast)
  assert.equal(bars.length, 14)
  assert.ok(zeroPct > 0 && zeroPct < 100)
  assert.ok(bars.some((b) => b.negative))
  for (const b of bars) assert.ok(b.heightPct >= 0 && b.heightPct <= 100)
})

test('loans_sortedAndCoverage', () => {
  const sorted = sortLoans(MOCK_LOAN_PRODUCTS, forecast.neededAmount)
  assert.equal(sorted[0].recommended, true)
  assert.equal(coversNeed(sorted[0], forecast.neededAmount), true)
  assert.equal(coversNeed(sorted[0], 0), false)
  assert.equal(rateText(MOCK_LOAN_PRODUCTS[0]), '연 5.4% ~ 7.9%')
  assert.equal(termText(MOCK_LOAN_PRODUCTS[1]), '12개월')
  assert.equal(termText(MOCK_LOAN_PRODUCTS[0]), '6~12개월')
  assert.equal(monthDay('2026-10-30'), '10월 30일')
})

// 주문이 수십 건인 날도 칸에는 합계만 (멘토님 질문) — 합계 · 건수 · 점선 여부가 맞아야 한다
test('daySummary_aggregatesBusyDay', () => {
  const items = calendarItems(settlements, transfers)
  const busy = busiestDay(items, today.slice(0, 7))!
  const rows = items.get(busy)!
  const sum = daySummary(rows)
  assert.ok(sum.inflowCount >= 20)
  assert.equal(
    sum.inflow,
    rows.filter((r) => r.stage !== 'OUTFLOW').reduce((n, r) => n + r.amount, 0),
  )
  // 픽업 전(예상) 정산이 섞이면 칸 칩은 점선(예상)
  assert.equal(sum.inflowStage, sum.byStage.EXPECTED.count > 0 ? 'EXPECTED' : sum.inflowStage)
  assert.equal(filterDayItems(rows, 'EXPECTED', '').length, sum.byStage.EXPECTED.count)
  assert.ok(filterDayItems(rows, 'ALL', '마카롱').every((r) => r.title.includes('마카롱')))
})
