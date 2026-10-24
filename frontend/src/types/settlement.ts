// P6 정산 · 자금 타입 (settlements · loan_products · 외부 은행 API)
// 은행 잔액 · 예정 출금은 외부 은행에서 가져온다 (시연은 WireMock 은행 컨테이너, 2-27)
// 14일 자금 예측은 저장하지 않고 백엔드가 그때그때 계산한다

// settlements.status (V20261022_145120 주석과 같다)
export type SettlementStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELED'

// 정산 1건 — 날짜 컬럼은 2-25에서 settlements에 추가
export type SettlementEntry = {
  settlementId: string
  paymentId: string
  orderRef: string
  // payments에 컬럼이 없어 null 허용 (0-8)
  orderTitle: string | null
  grossAmount: number
  feeAmount: number
  // 사장님이 받는 돈 (settlements.settlement_amount)
  settlementAmount: number
  status: SettlementStatus
  // 예상 정산일 = 픽업 예정 + 72시간
  expectedAt: string
  // 확정 정산일 = 픽업 완료 + 72시간, 픽업 전이면 null
  scheduledAt: string | null
  completedAt: string | null
}

// 캘린더 칸 색: 정산 완료(초록) · 정산 예정(파랑) · 예상 정산(점선) · 지출(빨강)
export type CalendarStage = 'COMPLETED' | 'SCHEDULED' | 'EXPECTED' | 'OUTFLOW'

export type BankBalance = {
  bankName: string
  // 가린 계좌 번호 (예: 123-***-7890)
  accountMasked: string
  balance: number
  asOf: string
}

// MATERIAL = 재료비, RENT = 임대료, PAYROLL = 급여
export type TransferCategory = 'MATERIAL' | 'RENT' | 'PAYROLL' | 'ETC'

// 은행에 등록된 예정 출금 (자동이체)
export type ScheduledTransfer = {
  transferId: string
  // 한국 시간 날짜 YYYY-MM-DD
  date: string
  label: string
  amount: number
  category: TransferCategory
}

export type FundForecastDay = {
  // 한국 시간 날짜 YYYY-MM-DD
  date: string
  inflow: number
  outflow: number
  // 그날이 끝났을 때 예상 잔액 = 전날 잔액 + 입금 − 출금
  balance: number
  settlementIds: string[]
  transferIds: string[]
}

// 왜 부족해지나 — 화면 "부족 원인" 카드
export type FundShortageCauses = {
  // 매입 보류(HELD)라 정산 일정에 없는 결제
  heldPaymentCount: number
  heldAmount: number
  // 픽업 전이라 확정되지 않은 정산 (예측에는 들어가 있지만 늦어질 수 있음)
  unconfirmedAmount: number
  largeTransfers: ScheduledTransfer[]
}

export type FundForecast = {
  bank: BankBalance
  days: FundForecastDay[]
  transfers: ScheduledTransfer[]
  totalInflow: number
  totalOutflow: number
  minBalance: number
  // 처음 0원 아래로 내려가는 날, 없으면 null
  firstShortageDate: string | null
  // 최저 잔액을 0원 위로 올리는 데 필요한 금액 (10만 원 단위 올림), 부족 없으면 0
  neededAmount: number
  causes: FundShortageCauses
}

// loan_products — 조회만, 신청 없음
export type LoanProduct = {
  loanProductId: string
  bankName: string
  productName: string
  maxLimitAmount: number
  // 연 이율, 비율 0~1
  minRate: number
  maxRate: number
  minTermMonths: number
  maxTermMonths: number
  feature: string
  recommended: boolean
}
