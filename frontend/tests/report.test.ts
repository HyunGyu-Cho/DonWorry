import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { buildMockStaffAlerts } from '../src/api/mock/fds.ts'
import {
  buildMockStaffCases,
  resetMockInvestigation,
  setMockActor,
} from '../src/api/mock/investigation.ts'
import { buildMockReports, mockGetCaseReport } from '../src/api/mock/report.ts'
import { toConclusionReport } from '../src/api/reportConvert.ts'
import { StaffReportForbiddenError } from '../src/api/reportErrors.ts'
import { riskLevel } from '../src/config/reportLevel.ts'
import type { ReportBody } from '../src/types/case.ts'

beforeEach(() => resetMockInvestigation())

// 탈취된 직원이 자기 사건 보고서를 보면 어떤 증거가 잡혔는지 알아낸다
test('mockGetStaffCaseReport_whenNotManager_rejects', async () => {
  setMockActor({ userId: 4, role: 'SECURITY_STAFF', displayName: '박지원' })
  await assert.rejects(mockGetCaseReport('101'), StaffReportForbiddenError)
  await assert.rejects(mockGetCaseReport('102'), StaffReportForbiddenError)
  // 결제 사건 보고서는 보안 직원도 본다
  assert.equal((await mockGetCaseReport('201'))?.reportType, 'PAYMENT_FRAUD')
  setMockActor({ userId: 5, role: 'SECURITY_MANAGER', displayName: '최윤서' })
  assert.equal((await mockGetCaseReport('101'))?.reportType, 'STAFF_TAKEOVER')
})

const legacy: ReportBody = {
  overview: {
    caseId: '7',
    merchantId: '1',
    customerRef: 'C-1',
    paymentCount: 2,
    totalAmount: 700000,
    caseCreatedAt: '2026-10-24T00:00:00Z',
    investigatedAt: '2026-10-24T00:05:00Z',
    reportVersion: 2,
  },
  summary: ['처음 쓰는 카드로 고액 결제'],
  paymentAnalyses: [
    {
      paymentId: '11',
      amount: 650000,
      requestedAt: '2026-10-24T00:00:00Z',
      riskScore: 65,
      ruleHits: ['HIGH_AMOUNT'],
      riskEvidence: ['고액 결제'],
      normalEvidence: [],
      unknowns: ['본인 확인'],
      recommendation: 'REJECT_REVIEW',
    },
    {
      paymentId: '12',
      amount: 50000,
      requestedAt: '2026-10-24T00:01:00Z',
      riskScore: null,
      ruleHits: [],
      riskEvidence: [],
      normalEvidence: ['평소 금액'],
      unknowns: [],
      recommendation: 'ACCEPT_REVIEW',
    },
  ],
  timeline: [{ at: '2026-10-24T00:00:00Z', event: '결제 11 매입 보류' }],
  overallAnalysis: ['짧은 간격 재결제'],
  additionalChecks: ['구매자 연락'],
  recommendation: { summary: '결제 11은 취소 검토', limitations: ['AI 권고는 최종 결정이 아님'] },
  evidence: [
    {
      toolName: 'get_fds_evidence',
      source: 'P2',
      evidenceId: 'EV-1',
      retrievedAt: '2026-10-24T00:04:00Z',
      dataVersion: 'v1',
    },
  ],
}

// 기존 보고서를 바꾸다가 AI 권고나 증거가 빠지면 직원이 잘못 판정한다
test('toConclusionReport_fromLegacyBody_keepsRecommendationAndEvidence', () => {
  const report = toConclusionReport(legacy)
  assert.equal(report.caseId, '7')
  assert.equal(report.reportVersion, 2)
  assert.equal(report.verdict, '결제 11은 취소 검토')
  assert.equal(report.riskScore, 65)
  assert.deepEqual(
    report.paymentRecommendations?.map((p) => [p.paymentId, p.recommendation, p.amount]),
    [
      ['11', 'REJECT_REVIEW', 650000],
      ['12', 'ACCEPT_REVIEW', 50000],
    ],
  )
  assert.deepEqual(
    report.recommendations.map((r) => r.kind),
    ['NEGATIVE', 'POSITIVE'],
  )
  assert.deepEqual(
    report.evidence.map((e) => e.evidenceId),
    ['EV-1'],
  )
  assert.deepEqual(
    report.riskPoints.map((p) => p.title),
    ['고액 결제'],
  )
  assert.deepEqual(
    report.normalPoints.map((p) => p.title),
    ['평소 금액'],
  )
  assert.deepEqual(report.unknowns, ['본인 확인'])
  assert.deepEqual(report.limitations, ['AI 권고는 최종 결정이 아님'])
})

// 위험도 표시가 FDS 판정 구간(40 · 70)과 어긋나면 안 된다
test('riskLevel_atBoundaries', () => {
  assert.equal(riskLevel(0), 'CAUTION')
  assert.equal(riskLevel(39), 'CAUTION')
  assert.equal(riskLevel(40), 'MEDIUM')
  assert.equal(riskLevel(69), 'MEDIUM')
  assert.equal(riskLevel(70), 'HIGH')
})

// 보고서 근거에 없는 경보 · 사건 번호가 나오면 안 된다
test('mockReports_referOnlyExistingCasesAndAlerts', () => {
  const now = new Date('2026-10-24T01:00:00Z')
  const cases = new Map(buildMockStaffCases(now).map((c) => [c.caseId, c]))
  const alertIds = new Set(buildMockStaffAlerts(now).map((a) => a.staffHitId))
  for (const report of buildMockReports(now)) {
    const alertRefs = report.evidence.filter((e) => e.ref?.type === 'STAFF_ALERT')
    if (report.reportType === 'PAYMENT_FRAUD') {
      assert.equal(alertRefs.length, 0)
      assert.ok(report.paymentRecommendations && report.paymentRecommendations.length > 0)
      continue
    }
    const staffCase = cases.get(report.caseId)
    assert.ok(staffCase, `보고서의 사건 ${report.caseId}`)
    assert.equal(staffCase.caseType, report.reportType)
    assert.equal(report.paymentRecommendations, null)
    for (const e of alertRefs) {
      assert.ok(alertIds.has(e.ref!.id), `경보 ${e.ref!.id}`)
      assert.ok(
        staffCase.staffHitIds.includes(e.ref!.id),
        `사건 ${report.caseId}에 없는 경보 ${e.ref!.id}`,
      )
    }
  }
})
