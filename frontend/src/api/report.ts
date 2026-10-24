// P4 보고서 API 계약 — 사건별 최신 AI 보고서 (결론 카드 구조)
// VITE_USE_MOCK에 report가 있으면 Mock, 없으면 실제 API를 쓴다
// 결제 사건의 기존 8개 절 보고서는 api/cases.ts가 가져오고, 화면에서 api/reportConvert.ts로 바꾼다
import { api, ApiError } from './client.ts'
import { isMock } from './mockMode.ts'
import { mockGetCaseReport } from './mock/report.ts'
import { StaffReportForbiddenError } from './reportErrors.ts'
import type { ConclusionReport } from '../types/report.ts'

// RPT_010: 직원 계정 사건 보고서 열람 권한 없음 (2-12에서 백엔드 추가)
async function realGetCaseReport(caseId: string): Promise<ConclusionReport | null> {
  try {
    return await api<ConclusionReport>(`/investigation/cases/${caseId}/report`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    if (error instanceof ApiError && error.code === 'RPT_010') throw new StaffReportForbiddenError()
    throw error
  }
}

// 사건의 최신 보고서. 아직 없으면 null
export const getCaseReport = isMock('report') ? mockGetCaseReport : realGetCaseReport
