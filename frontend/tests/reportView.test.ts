import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildMockReports } from '../src/api/mock/report.ts'
import type { ReportRun, SimilarCase } from '../src/types/report.ts'
import { reportPageState, similarSummary, traceSummary } from '../src/utils/reportView.ts'

const now = new Date('2026-10-24T06:00:00Z')
const reports = buildMockReports(now)
const r201 = reports.find((r) => r.caseId === '201')!
const run = (status: ReportRun['status'], reportVersion: number): ReportRun => ({
  caseId: '201',
  reportVersion,
  status,
  startedAt: now.toISOString(),
  finishedAt: null,
  steps: [],
  currentStepNo: null,
})

// 보고서 화면은 보고서가 완성된 뒤에만 생긴다. 다시 조사 중이면 지난 보고서 + 안내
test('reportPageState_onlyAfterReportExists', () => {
  assert.equal(reportPageState(null, run('RUNNING', 1)), 'NOT_READY')
  assert.equal(reportPageState(null, null), 'NONE')
  assert.equal(reportPageState(r201, run('SUCCEEDED', 1)), 'READY')
  assert.equal(reportPageState(r201, run('RUNNING', 2)), 'RERUNNING')
  assert.equal(reportPageState(r201, null), 'READY')
})

// 조사가 최종 실패하면 직접 판정 안내, 이전 완료본이 있으면 그 보고서 + 실패 띠 (2-17b)
test('reportPageState_failedRun', () => {
  const v = r201.reportVersion
  assert.equal(reportPageState(null, run('FAILED', 1)), 'FAILED')
  assert.equal(reportPageState(r201, run('FAILED', v + 1)), 'LATEST_FAILED')
  assert.equal(reportPageState(r201, run('FAILED', v)), 'READY')
})

test('similarSummary_countsFraudAndStrongMatch', () => {
  assert.equal(
    similarSummary(r201.similarCases),
    '2건 중 1건이 사기로 끝났어요. 같은 대상이 겹친 사건이 사기였어요.',
  )
  assert.match(similarSummary([]), /처음 보는 유형/)
  const normalStrong: SimilarCase[] = [{ ...r201.similarCases[0], outcome: 'NORMAL' }]
  assert.match(similarSummary(normalStrong), /겹친 사건은 정상이었어요/)
})

// 분산 공격 사건 102 조사 과정에는 AI 답 다시 쓰기(1차 실패 → 재시도)가 있다
test('traceSummary_countsToolsAndRetries', () => {
  const r102 = reports.find((r) => r.caseId === '102')!
  const sum = traceSummary(r102.trace)
  assert.ok(sum.toolCalls >= 2)
  assert.ok(sum.retries >= 1)
  assert.equal(
    sum.totalMs,
    r102.trace.reduce((a, s) => a + (s.durationMs ?? 0), 0),
  )
})

// 화면 문장(결론 · 권고 · 근거)에 결제 번호 원문이 없다
test('report201_textHasNoRawPaymentNumber', () => {
  const texts = [
    r201.verdict,
    r201.summary,
    ...r201.recommendations.map((x) => x.label),
    ...r201.riskPoints.map((p) => p.title + p.detail),
    ...r201.timeline.map((t) => t.text),
    ...(r201.paymentRecommendations ?? []).map((p) => p.label),
  ]
  for (const t of texts) assert.doesNotMatch(t, /#\d+/)
})
