// P4 AI 조사 보고서 — 결론 카드 구조 (프로토타입 v3.1)
// 읽는 순서: 결론 → 위험 근거 vs 정상 정황 → 경위 → 확인할 것 → (펼치기) 상세 근거
// [Spring] = 백엔드가 DB 사실로 채움, [AI] = ai-server가 해석해서 채움 (팀 시절 P4 결정)
// 기존 8개 절 보고서(types/case.ts ReportBody)는 api/reportConvert.ts로 이 구조로 바꿔 보여 준다
import type { AiRecommendation, CaseType } from './case.ts'

export type ReportType = CaseType

// config/reportLevel.ts에서 점수로 정한다
export type RiskLevel = 'HIGH' | 'MEDIUM' | 'CAUTION'

// 권고 버튼 색: 진행(초록) · 중단/차단(빨강) · 참고(파랑)
export type RecommendationKind = 'POSITIVE' | 'NEGATIVE' | 'INFO'

export type ReportRecommendation = {
  label: string
  kind: RecommendationKind
}

// 위험 근거 · 정상 정황 한 줄 [AI]
export type ReportPoint = {
  title: string
  detail: string
  source: string
}

// WARNING = 의심 지점, KEY = 사건 생성 · 판정 같은 분기점
export type TimelineKind = 'NORMAL' | 'WARNING' | 'KEY'

// 사건 경위 한 줄 [Spring]
export type ReportTimelineItem = {
  at: string
  text: string
  kind: TimelineKind
}

// 근거가 가리키는 원본 기록 (화면에서 해당 기록으로 이동)
export type EvidenceRef = {
  type: 'PAYMENT' | 'FDS_EVALUATION' | 'STAFF_ALERT' | 'LOGIN_EVENT' | 'BUYER_CONFIRMATION'
  id: number
}

// 상세 근거 1건 [Spring]
export type ReportEvidence = {
  evidenceId: string
  source: string
  description: string
  retrievedAt: string | null
  ref: EvidenceRef | null
}

// 결제별 권고 — 결제 사기 보고서만. 금액 · 이름 [Spring], 권고 · 이유 [AI]
export type PaymentRecommendation = {
  paymentId: string
  label: string
  amount: number | null
  recommendation: AiRecommendation
  reason: string
}

export type ConclusionReport = {
  schemaVersion: 2
  reportType: ReportType
  caseId: string
  reportVersion: number
  generatedAt: string
  // ── 결론 카드 [AI] ──
  riskScore: number
  verdict: string
  summary: string
  recommendations: ReportRecommendation[]
  // ── 근거 비교 [AI] ──
  riskPoints: ReportPoint[]
  normalPoints: ReportPoint[]
  // ── 판정 전에 확인할 것 [AI] ──
  unknowns: string[]
  checks: string[]
  // ── 경위 · 결제별 · 상세 근거 [Spring] ──
  timeline: ReportTimelineItem[]
  paymentRecommendations: PaymentRecommendation[] | null
  evidence: ReportEvidence[]
  // ── 보고서 정보 ──
  limitations: string[]
  model: string
}
