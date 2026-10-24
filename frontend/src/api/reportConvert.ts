// 기존 8개 절 보고서(types/case.ts ReportBody) → 결론 카드(types/report.ts)
// 팀 백엔드가 만든 보고서도 새 보고서 화면(1-7)에 같은 모양으로 보여 주기 위한 변환
// 원본에 없는 값은 지어내지 않는다 (빈 목록 · 원본 문장 그대로)
import type { AiRecommendation, ReportBody } from '../types/case.ts'
import type { ConclusionReport, RecommendationKind, ReportType } from '../types/report.ts'

const RECOMMENDATION_TEXT: Record<AiRecommendation, { label: string; kind: RecommendationKind }> = {
  ACCEPT_REVIEW: { label: '매입 진행 검토', kind: 'POSITIVE' },
  REJECT_REVIEW: { label: '승인 취소 검토', kind: 'NEGATIVE' },
  NEEDS_CHECK: { label: '추가 확인', kind: 'INFO' },
}

export function toConclusionReport(
  body: ReportBody,
  reportType: ReportType = 'PAYMENT_FRAUD',
): ConclusionReport {
  const analyses = body.paymentAnalyses
  const scores = analyses.map((a) => a.riskScore).filter((s): s is number => s !== null)
  const perPayment = (pick: (a: (typeof analyses)[number]) => string[]) =>
    analyses.flatMap((a) =>
      pick(a).map((text) => ({ title: text, detail: `결제 ${a.paymentId}`, source: 'AI 보고서' })),
    )

  return {
    schemaVersion: 2,
    reportType,
    caseId: body.overview.caseId,
    reportVersion: body.overview.reportVersion,
    generatedAt: body.overview.investigatedAt,
    riskScore: scores.length > 0 ? Math.max(...scores) : 0,
    verdict: body.recommendation.summary,
    summary: [...body.summary, ...body.overallAnalysis].join(' '),
    recommendations: analyses.map((a) => ({
      label: `${RECOMMENDATION_TEXT[a.recommendation].label} · 결제 ${a.paymentId}`,
      kind: RECOMMENDATION_TEXT[a.recommendation].kind,
    })),
    riskPoints: perPayment((a) => a.riskEvidence),
    normalPoints: perPayment((a) => a.normalEvidence),
    unknowns: analyses.flatMap((a) => a.unknowns),
    checks: body.additionalChecks,
    timeline: body.timeline.map((t) => ({ at: t.at, text: t.event, kind: 'NORMAL' })),
    paymentRecommendations: analyses.map((a) => ({
      paymentId: a.paymentId,
      label: `결제 ${a.paymentId}`,
      amount: a.amount,
      recommendation: a.recommendation,
      reason: a.riskEvidence[0] ?? a.normalEvidence[0] ?? '',
    })),
    evidence: body.evidence.map((e) => ({
      evidenceId: e.evidenceId,
      source: `${e.toolName} · ${e.source}`,
      description: `데이터 버전 ${e.dataVersion}`,
      retrievedAt: e.retrievedAt,
      ref: null,
    })),
    // 기존 형식에는 비슷한 사건 · 조사 과정이 없다 (만들어 넣지 않음)
    similarCases: [],
    trace: [],
    limitations: body.recommendation.limitations,
    model: '기존 보고서 형식',
  }
}
