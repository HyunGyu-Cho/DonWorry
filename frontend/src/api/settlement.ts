// P6 정산 · 자금 API 계약 — 정산 캘린더 · 14일 자금 예측 · 연계 대출 상품
// VITE_USE_MOCK에 settlement가 있으면 Mock, 없으면 실제 API를 쓴다
// 화면은 은행을 직접 부르지 않는다 — 은행 잔액 · 예정 출금은 백엔드가 은행 API에서 가져와 예측에 담는다
import { api } from './client.ts'
import { isMock } from './mockMode.ts'
import { mockGetFundForecast, mockGetLoanProducts, mockGetSettlements } from './mock/settlement.ts'
import type { FundForecast, LoanProduct, SettlementEntry } from '../types/settlement.ts'

function realGetSettlements(from?: string, to?: string) {
  const search = new URLSearchParams()
  if (from) search.set('from', from)
  if (to) search.set('to', to)
  const text = search.toString()
  return api<SettlementEntry[]>(`/settlement/settlements${text ? `?${text}` : ''}`)
}

const realGetFundForecast = () => api<FundForecast>('/settlement/funds/forecast')
const realGetLoanProducts = () => api<LoanProduct[]>('/settlement/loan-products')

const mock = isMock('settlement')

// 정산 캘린더 (로그인한 가맹점 것만 — 백엔드가 거른다). from · to는 한국 시간 YYYY-MM-DD
export const getSettlements = mock ? mockGetSettlements : realGetSettlements
// 은행 잔액 · 예정 출금 · 14일 예측 (저장하지 않고 요청할 때 계산)
export const getFundForecast = mock ? mockGetFundForecast : realGetFundForecast
// 연계 대출 상품 (조회만, 신청 없음)
export const getLoanProducts = mock ? mockGetLoanProducts : realGetLoanProducts
