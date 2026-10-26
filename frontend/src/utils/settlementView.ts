// 정산 캘린더 · 자금 현황 · 대출 상품 화면(1-10)의 계산과 말 바꾸기
// React 없이 순수 함수만 (node 테스트가 직접 불러온다). 날짜는 한국 시간 YYYY-MM-DD
import { calendarStage, kstDate } from '../config/settlement.ts'
import type {
  CalendarStage,
  FundForecast,
  LoanProduct,
  ScheduledTransfer,
  SettlementEntry,
} from '../types/settlement.ts'
import { koreanWon } from './humanize.ts'

export const STAGE_VIEW: Record<CalendarStage, { label: string; note: string }> = {
  COMPLETED: { label: '정산 완료', note: '통장에 들어왔어요' },
  SCHEDULED: { label: '정산 예정', note: '픽업이 끝나 날짜가 정해졌어요' },
  EXPECTED: { label: '예상 정산', note: '픽업 전이라 늦어질 수 있어요' },
  OUTFLOW: { label: '예정 출금', note: '은행 자동이체' },
}

export const STAGE_ORDER: CalendarStage[] = ['COMPLETED', 'SCHEDULED', 'EXPECTED', 'OUTFLOW']

export type CalendarItem = {
  key: string
  stage: CalendarStage
  title: string
  amount: number
  // 정산은 "받는 돈"(수수료 뺀 금액), 출금은 나가는 돈
  sub: string
  rawId: string
  // 정산만: 결제 금액 · 수수료 (목록 표)
  gross?: number
  fee?: number
}

// 정산이 캘린더에 놓이는 날 = 완료일 → 확정일 → 예상일
export const entryDate = (s: SettlementEntry) =>
  kstDate(s.completedAt ?? s.scheduledAt ?? s.expectedAt)

// 날짜별 칸 내용. 취소된 정산은 그리지 않는다
export function calendarItems(
  settlements: SettlementEntry[],
  transfers: ScheduledTransfer[],
): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>()
  const push = (date: string, item: CalendarItem) => map.set(date, [...(map.get(date) ?? []), item])
  for (const s of settlements) {
    const stage = calendarStage(s)
    if (!stage) continue
    push(entryDate(s), {
      key: `s${s.settlementId}`,
      stage,
      title: s.orderTitle ?? '주문 정보 없음',
      amount: s.settlementAmount,
      sub: `결제 ${koreanWon(s.grossAmount)} − 수수료 ${koreanWon(s.feeAmount)}`,
      rawId: s.settlementId,
      gross: s.grossAmount,
      fee: s.feeAmount,
    })
  }
  for (const t of transfers) {
    push(t.date, {
      key: `t${t.transferId}`,
      stage: 'OUTFLOW',
      title: t.label,
      amount: t.amount,
      sub: '은행 자동이체',
      rawId: t.transferId,
    })
  }
  return map
}

// 그 달(YYYY-MM) 요약: 받은 돈 · 받을 돈 · 나갈 돈
export function monthSummary(items: Map<string, CalendarItem[]>, month: string) {
  const sum = { received: 0, toReceive: 0, outflow: 0 }
  for (const [date, rows] of items) {
    if (!date.startsWith(month)) continue
    for (const r of rows) {
      if (r.stage === 'COMPLETED') sum.received += r.amount
      else if (r.stage === 'OUTFLOW') sum.outflow += r.amount
      else sum.toReceive += r.amount
    }
  }
  return sum
}

// 2026-10-30 → 10월 30일
export function monthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${m}월 ${d}일`
}

// 오늘부터 며칠 뒤 (둘 다 YYYY-MM-DD)
export const daysUntil = (date: string, today: string) =>
  Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000)

// 부족 경고 한 줄 — "5일 뒤(10월 30일) 매장 임대료 날 잔액이 15만 원 모자라요"
export function shortageText(forecast: FundForecast, today: string): string | null {
  const date = forecast.firstShortageDate
  if (!date) return null
  const day = forecast.days.find((d) => d.date === date)
  const biggest = forecast.transfers
    .filter((t) => t.date === date)
    .sort((a, b) => b.amount - a.amount)[0]
  const n = daysUntil(date, today)
  const when = n <= 0 ? '오늘' : n === 1 ? '내일' : `${n}일 뒤(${monthDay(date)})`
  const what = biggest ? ` ${biggest.label} 날` : ''
  return `${when}${what} 잔액이 ${koreanWon(-(day?.balance ?? 0))} 모자라요`
}

// 14일 막대 — 0원 선의 위치와 막대 높이를 % 로 (0원 아래 막대는 아래로 그린다)
export function balanceBars(forecast: FundForecast) {
  const values = forecast.days.map((d) => d.balance)
  const top = Math.max(forecast.bank.balance, ...values, 1)
  const bottom = Math.min(0, ...values)
  const range = top - bottom
  return {
    zeroPct: (top / range) * 100,
    bars: forecast.days.map((d) => ({
      date: d.date,
      balance: d.balance,
      negative: d.balance < 0,
      heightPct: (Math.abs(d.balance) / range) * 100,
    })),
  }
}

// 필요한 금액만큼 빌릴 수 있는 상품인지
export const coversNeed = (p: LoanProduct, needed: number) =>
  needed > 0 && p.maxLimitAmount >= needed

// 추천 → 필요 금액을 채우는 상품 → 금리 낮은 순
export function sortLoans(products: LoanProduct[], needed: number): LoanProduct[] {
  const rank = (p: LoanProduct) => (p.recommended ? 0 : 2) + (coversNeed(p, needed) ? 0 : 1)
  return [...products].sort((a, b) => rank(a) - rank(b) || a.minRate - b.minRate)
}

const percent = (rate: number) => `${Math.round(rate * 1000) / 10}%`
export const rateText = (p: LoanProduct) => `연 ${percent(p.minRate)} ~ ${percent(p.maxRate)}`
export const termText = (p: LoanProduct) =>
  p.minTermMonths === p.maxTermMonths
    ? `${p.maxTermMonths}개월`
    : `${p.minTermMonths}~${p.maxTermMonths}개월`

export type DaySummary = {
  inflow: number
  inflowCount: number
  outflow: number
  outflowCount: number
  // 들어올 돈 칩 색: 모두 완료면 완료, 픽업 전(예상)이 섞이면 예상(점선), 아니면 예정
  inflowStage: CalendarStage
  byStage: Record<CalendarStage, { count: number; amount: number }>
}

// 날짜 칸 · 오른쪽 칸 요약 — 주문이 수십 건이어도 칸에는 합계만 (1-13 멘토님 질문)
export function daySummary(rows: CalendarItem[]): DaySummary {
  const byStage = Object.fromEntries(
    STAGE_ORDER.map((s) => [s, { count: 0, amount: 0 }]),
  ) as DaySummary['byStage']
  for (const r of rows) {
    byStage[r.stage].count += 1
    byStage[r.stage].amount += r.amount
  }
  const ins = rows.filter((r) => r.stage !== 'OUTFLOW')
  const inflowStage: CalendarStage =
    ins.length > 0 && ins.every((r) => r.stage === 'COMPLETED')
      ? 'COMPLETED'
      : byStage.EXPECTED.count > 0
        ? 'EXPECTED'
        : 'SCHEDULED'
  return {
    inflow: ins.reduce((n, r) => n + r.amount, 0),
    inflowCount: ins.length,
    outflow: byStage.OUTFLOW.amount,
    outflowCount: byStage.OUTFLOW.count,
    inflowStage,
    byStage,
  }
}

// 오른쪽 칸에서 미리 보여 줄 주문 수 — 넘으면 [모두 보기]
export const DAY_PREVIEW = 5

// 목록 창 · 전체 페이지 거르기: 상태 + 주문 이름 검색
export function filterDayItems(
  rows: CalendarItem[],
  stage: CalendarStage | 'ALL',
  query: string,
): CalendarItem[] {
  const q = query.trim()
  return rows.filter((r) => (stage === 'ALL' || r.stage === stage) && (!q || r.title.includes(q)))
}

// 그 달에서 주문이 가장 많은 날 (튜토리얼이 노란 테두리를 붙인다)
export function busiestDay(items: Map<string, CalendarItem[]>, month: string): string | null {
  let best: [string, number] | null = null
  for (const [date, rows] of items) {
    if (!date.startsWith(month)) continue
    const n = rows.filter((r) => r.stage !== 'OUTFLOW').length
    if (!best || n > best[1]) best = [date, n]
  }
  return best && best[1] > 1 ? best[0] : null
}
