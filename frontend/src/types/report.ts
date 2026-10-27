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

// 비슷한 과거 사건 [Spring] — find_similar_cases(P3) 결과. 판정 참고용, 자동 판정에 쓰지 않는다
export type SimilarMatch =
  | 'SAME_CARD'
  | 'SAME_DEVICE'
  | 'SAME_IP'
  | 'SAME_EMAIL'
  | 'SAME_CUSTOMER'
  | 'SAME_STAFF'
  | 'RULE_COMBO'
// 사건 판정 결과 (사기로 끝남 · 정상으로 끝남)
export type SimilarOutcome = 'FRAUD' | 'NORMAL'

export type SimilarCase = {
  // 누르면 이 사건의 최종 보고서로 간다 (직원 사건은 보안 관리자만, RPT_010)
  caseId: string
  caseType: CaseType
  title: string
  occurredAt: string
  outcome: SimilarOutcome
  outcomeLabel: string
  matches: SimilarMatch[]
  // STRONG = 같은 대상이 겹침, WEAK = Rule 조합만 비슷
  strength: 'STRONG' | 'WEAK'
}

// AI 조사 과정 한 단계 [Spring 기록] — 요약만 남기고 원본 데이터 · 프롬프트 전문은 넣지 않는다
export type ReportToolName =
  | 'get_fds_evidence'
  | 'get_case_payments'
  | 'get_payment_history'
  | 'get_payment_authentication'
  | 'get_security_events'
  | 'get_order_context'
  | 'find_similar_cases'
// LLM_FAILED = AI 답이 구조 검증에서 떨어져 다시 쓰는 단계 (ai-server 안에서 최대 3회)
// RETRY = 최종 실패 뒤 직원이 [AI 조사 다시 하기]를 누름 — 새 버전의 첫 단계 (2-19e)
export type ReportStepKind =
  'RETRY' | 'REQUEST' | 'TOOL' | 'LLM' | 'LLM_FAILED' | 'VALIDATE' | 'SAVE'
export type ReportStepStatus = 'RUNNING' | 'DONE' | 'FAILED'

export type ReportStep = {
  stepNo: number
  kind: ReportStepKind
  label: string
  toolName: ReportToolName | null
  startedAt: string
  // 진행 중이면 null
  durationMs: number | null
  asked: string
  got: string | null
  status: ReportStepStatus
}

// 조사 진행 상태 — 화면이 조사 중에 1초마다 확인한다
// SUPERSEDED = 조사 중 새 정보(경보 병합 · 구매자 응답)가 와서 새 버전으로 대체됨 (2-18)
export type ReportRunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SUPERSEDED'

export type ReportRun = {
  caseId: string
  reportVersion: number
  status: ReportRunStatus
  startedAt: string
  finishedAt: string | null
  steps: ReportStep[]
  // 진행 중인 단계 번호, 끝났으면 null
  currentStepNo: number | null
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
  // ── 비슷한 과거 사건 [Spring] · 조사 과정 [Spring 기록] (없으면 빈 목록) ──
  similarCases: SimilarCase[]
  trace: ReportStep[]
  // ── 보고서 정보 ──
  limitations: string[]
  model: string
}
