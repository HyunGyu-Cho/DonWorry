// P6 정산 · 자금 Mock — 시나리오 ③ 장면 (프로토타입 v4.2: 임대료 날 잔액이 0원 아래로)
// 은행 잔액 · 예정 출금은 WireMock 은행이 줄 값과 같은 모양, 매입 보류 결제는 api/mock/payment.ts 결제 31
// 테스트가 직접 불러오므로 import.meta.env를 읽는 mockMode는 쓰지 않는다
import {
  calendarStage,
  FORECAST_DAYS,
  kstDate,
  LARGE_TRANSFER_AMOUNT,
  neededAmount,
  settleAfterPickup,
} from '../../config/settlement.ts'
import { buildMockPayments } from './payment.ts'
import { mockRespond } from './respond.ts'
import type {
  BankBalance,
  FundForecast,
  FundForecastDay,
  LoanProduct,
  ScheduledTransfer,
  SettlementEntry,
} from '../../types/settlement.ts'

const FEE_RATE = 0.03
const HOUR = 3_600_000
const DAY = 24 * HOUR

// 오늘(한국 시간) 기준 dayOffset일 뒤 hour시 (한국 시간)
function kstAt(now: Date, dayOffset: number, hour: number) {
  const today = kstDate(now)
  return new Date(Date.parse(`${today}T00:00:00+09:00`) + dayOffset * DAY + hour * HOUR)
}

export function buildMockSettlements(now: Date): SettlementEntry[] {
  // [정산 번호, 결제 번호, 주문 이름, 금액, 픽업 예정(며칠 뒤), 픽업 완료 여부, 정산 완료 여부]
  const rows: [string, string, string, number, number, boolean, boolean][] = [
    ['1', '41', '초코 케이크', 45000, -5, true, true],
    ['2', '42', '치즈 케이크', 62000, -4, true, true],
    ['3', '43', '단체 컵케이크 (30개)', 280000, -2, true, false],
    ['4', '44', '딸기 케이크', 52000, -1, true, false],
    ['5', '33', '딸기 생크림 케이크', 38000, 1, false, false],
    ['6', '45', '기념일 레터링 케이크', 260000, 4, false, false],
    ['7', '46', '단체 행사 세트 (20개)', 900000, 6, false, false],
  ]
  return rows.map(([settlementId, paymentId, orderTitle, gross, pickupDay, picked, done]) => {
    const pickupAt = kstAt(now, pickupDay, 15).toISOString()
    const scheduledAt = picked ? settleAfterPickup(pickupAt) : null
    const fee = Math.round(gross * FEE_RATE)
    return {
      settlementId,
      paymentId,
      orderRef: `CS-ORDER-${paymentId}`,
      orderTitle,
      grossAmount: gross,
      feeAmount: fee,
      settlementAmount: gross - fee,
      status: done ? 'COMPLETED' : 'SCHEDULED',
      expectedAt: settleAfterPickup(pickupAt),
      scheduledAt,
      completedAt: done && scheduledAt ? scheduledAt : null,
    }
  })
}

export function buildMockBank(now: Date): BankBalance {
  return {
    bankName: '한빛은행 (가상)',
    accountMasked: '110-***-482910',
    balance: 1_850_000,
    asOf: now.toISOString(),
  }
}

export function buildMockTransfers(now: Date): ScheduledTransfer[] {
  const day = (offset: number) => kstDate(kstAt(now, offset, 10))
  return [
    {
      transferId: '1',
      date: day(2),
      label: '재료비 (원재료 납품)',
      amount: 1_200_000,
      category: 'MATERIAL',
    },
    { transferId: '2', date: day(5), label: '매장 임대료', amount: 2_000_000, category: 'RENT' },
    {
      transferId: '3',
      date: day(10),
      label: '아르바이트 급여',
      amount: 1_300_000,
      category: 'PAYROLL',
    },
    {
      transferId: '4',
      date: day(13),
      label: '재료비 (원재료 납품)',
      amount: 800_000,
      category: 'MATERIAL',
    },
  ]
}

// 14일 예측 — 백엔드(2-26)와 같은 규칙: 은행 잔액 + 들어올 정산 − 예정 출금, 매입 보류는 빼고
export function buildForecast(
  now: Date,
  bank: BankBalance,
  settlements: SettlementEntry[],
  transfers: ScheduledTransfer[],
  held: { amount: number }[],
): FundForecast {
  const today = kstDate(now)
  const upcoming = settlements.filter((s) => s.status === 'SCHEDULED')
  // 지난 날짜인데 아직 안 들어온 정산은 오늘 들어온다고 본다
  const inflowDate = (s: SettlementEntry) => {
    const d = kstDate(s.scheduledAt ?? s.expectedAt)
    return d < today ? today : d
  }
  let balance = bank.balance
  const days: FundForecastDay[] = []
  for (let i = 0; i < FORECAST_DAYS; i++) {
    const date = kstDate(kstAt(now, i, 12))
    const ins = upcoming.filter((s) => inflowDate(s) === date)
    const outs = transfers.filter((t) => t.date === date)
    const inflow = ins.reduce((sum, s) => sum + s.settlementAmount, 0)
    const outflow = outs.reduce((sum, t) => sum + t.amount, 0)
    balance += inflow - outflow
    days.push({
      date,
      inflow,
      outflow,
      balance,
      settlementIds: ins.map((s) => s.settlementId),
      transferIds: outs.map((t) => t.transferId),
    })
  }
  const inRange = new Set(days.flatMap((d) => d.settlementIds))
  const minBalance = Math.min(bank.balance, ...days.map((d) => d.balance))
  return {
    bank,
    days,
    transfers: transfers.filter((t) => days.some((d) => d.date === t.date)),
    totalInflow: days.reduce((sum, d) => sum + d.inflow, 0),
    totalOutflow: days.reduce((sum, d) => sum + d.outflow, 0),
    minBalance,
    firstShortageDate: days.find((d) => d.balance < 0)?.date ?? null,
    neededAmount: neededAmount(minBalance),
    causes: {
      heldPaymentCount: held.length,
      heldAmount: held.reduce((sum, p) => sum + p.amount, 0),
      unconfirmedAmount: upcoming
        .filter((s) => calendarStage(s) === 'EXPECTED' && inRange.has(s.settlementId))
        .reduce((sum, s) => sum + s.settlementAmount, 0),
      largeTransfers: transfers.filter((t) => t.amount >= LARGE_TRANSFER_AMOUNT),
    },
  }
}

// loan_products 시드(V20261024_102019)와 같은 값
export const MOCK_LOAN_PRODUCTS: LoanProduct[] = [
  {
    loanProductId: '1',
    bankName: '한빛은행 (가상)',
    productName: '정산 연계 운전자금 대출',
    maxLimitAmount: 30_000_000,
    minRate: 0.054,
    maxRate: 0.079,
    minTermMonths: 6,
    maxTermMonths: 12,
    feature: '돈워리 정산 예정 금액을 근거로 한도를 산정합니다.',
    recommended: true,
  },
  {
    loanProductId: '2',
    bankName: '누리은행 (가상)',
    productName: '가맹점 마이너스 통장',
    maxLimitAmount: 20_000_000,
    minRate: 0.061,
    maxRate: 0.088,
    minTermMonths: 12,
    maxTermMonths: 12,
    feature: '한도 안에서 쓴 만큼만 이자를 냅니다. (연장 가능)',
    recommended: false,
  },
  {
    loanProductId: '3',
    bankName: '새솔저축은행 (가상)',
    productName: '소상공인 매출 기반 단기자금',
    maxLimitAmount: 10_000_000,
    minRate: 0.089,
    maxRate: 0.125,
    minTermMonths: 3,
    maxTermMonths: 6,
    feature: '최근 3개월 카드 매출 기준 · 빠른 심사',
    recommended: false,
  },
]

export function mockGetSettlements(from?: string, to?: string): Promise<SettlementEntry[]> {
  const rows = buildMockSettlements(new Date()).filter((s) => {
    const d = kstDate(s.completedAt ?? s.scheduledAt ?? s.expectedAt)
    return (!from || d >= from) && (!to || d <= to)
  })
  return mockRespond(rows)
}

export function mockGetFundForecast(): Promise<FundForecast> {
  const now = new Date()
  const held = buildMockPayments(now).filter((p) => p.status === 'HELD')
  return mockRespond(
    buildForecast(
      now,
      buildMockBank(now),
      buildMockSettlements(now),
      buildMockTransfers(now),
      held,
    ),
  )
}

export function mockGetLoanProducts(): Promise<LoanProduct[]> {
  return mockRespond(MOCK_LOAN_PRODUCTS)
}
