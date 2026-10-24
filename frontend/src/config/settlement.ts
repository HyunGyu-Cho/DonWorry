// P6 정산 규칙 상수 — 화면 문구와 Mock 계산이 같이 쓴다 (실제 계산은 백엔드 2-25 · 2-26)
import type { CalendarStage, SettlementEntry } from '../types/settlement.ts'

// 픽업 완료(또는 예정) 후 정산이 확정되기까지
export const SETTLEMENT_HOLD_HOURS = 72
// 자금 예측 기간
export const FORECAST_DAYS = 14
// 필요 자금은 10만 원 단위로 올린다
export const NEEDED_AMOUNT_UNIT = 100_000
// 이 금액 이상 출금은 "큰 지출"로 부족 원인에 보여 준다
export const LARGE_TRANSFER_AMOUNT = 1_000_000

const HOUR = 3_600_000

// 픽업 시각(예정 또는 완료) + 72시간
export const settleAfterPickup = (pickupAt: string) =>
  new Date(new Date(pickupAt).getTime() + SETTLEMENT_HOLD_HOURS * HOUR).toISOString()

export function neededAmount(minBalance: number) {
  if (minBalance >= 0) return 0
  return Math.ceil(-minBalance / NEEDED_AMOUNT_UNIT) * NEEDED_AMOUNT_UNIT
}

// 캘린더 칸 색. 취소된 정산은 캘린더에 그리지 않는다 (null)
export function calendarStage(entry: SettlementEntry): CalendarStage | null {
  if (entry.status === 'CANCELED') return null
  if (entry.status === 'COMPLETED') return 'COMPLETED'
  return entry.scheduledAt ? 'SCHEDULED' : 'EXPECTED'
}

// 한국 시간 날짜 YYYY-MM-DD
export const kstDate = (iso: string | Date) =>
  new Date(new Date(iso).getTime() + 9 * HOUR).toISOString().slice(0, 10)
