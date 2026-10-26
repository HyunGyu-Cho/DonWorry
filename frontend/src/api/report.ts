// P4 보고서 API 계약 — 사건별 최신 AI 보고서 (결론 카드 구조) · 조사 진행 상태
// VITE_USE_MOCK에 report가 있으면 Mock, 없으면 실제 API를 쓴다
// 결제 사건의 기존 8개 절 보고서는 api/cases.ts가 가져오고, 화면에서 api/reportConvert.ts로 바꾼다
import { api, ApiError } from './client.ts'
import { isMock } from './mockMode.ts'
import { mockGetCaseReport, mockGetReportRun, mockStartBuyerRerun } from './mock/report.ts'
import { StaffReportForbiddenError } from './reportErrors.ts'
import { asConclusionReport } from './reportConvert.ts'
import type { ReportBody } from '../types/case.ts'
import type { ConclusionReport, ReportRun } from '../types/report.ts'

// RPT_010: 직원 계정 사건 보고서 열람 권한 없음 (2-12에서 백엔드 추가)
async function realGetCaseReport(caseId: string): Promise<ConclusionReport | null> {
  try {
    // 백엔드는 저장된 본문을 그대로 준다 — 결론 카드(schemaVersion 2) 또는 옛 8개 절 형식 (2-17b)
    return asConclusionReport(
      await api<ReportBody | ConclusionReport>(`/investigation/cases/${caseId}/report`),
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    if (error instanceof ApiError && error.code === 'RPT_010') throw new StaffReportForbiddenError()
    throw error
  }
}

// 사건의 최신 보고서. 아직 없으면 null
export const getCaseReport = isMock('report') ? mockGetCaseReport : realGetCaseReport

// 2-17b에서 백엔드 추가 (단계 steps는 2-19b). 조사 기록이 없으면 404
async function realGetReportRun(caseId: string): Promise<ReportRun | null> {
  try {
    return await api<ReportRun>(`/investigation/cases/${caseId}/report/run`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    if (error instanceof ApiError && error.code === 'RPT_010') throw new StaffReportForbiddenError()
    throw error
  }
}

// 사건의 최신 조사 진행 상태. 화면은 RUNNING인 동안 1초마다 다시 부른다
export const getReportRun = isMock('report') ? mockGetReportRun : realGetReportRun

// 시연 버튼(튜토리얼 ①) — 구매자 답변이 도착한 것처럼 사건 201을 다시 조사. Mock에서만 (실제는 2-23 본인 확인 응답 → 재조사)
export const demoBuyerAnswered: (() => Promise<void>) | null = isMock('report')
  ? mockStartBuyerRerun
  : null
