import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { resetMockInvestigation, setMockActor } from '../src/api/mock/investigation.ts'
import {
  buildLiveRun,
  buildMockReports,
  mockGetCaseReport,
  mockGetReportRun,
  resetMockReportRun,
} from '../src/api/mock/report.ts'
import { StaffReportForbiddenError } from '../src/api/reportErrors.ts'
import type { ReportStep } from '../src/types/report.ts'

beforeEach(() => {
  resetMockInvestigation()
  resetMockReportRun()
  setMockActor({ userId: 5, role: 'SECURITY_MANAGER', displayName: '최윤서' })
})

const start = new Date('2026-10-24T03:00:00Z')
const after = (ms: number) => new Date(start.getTime() + ms)
// 시각을 빼고 단계 내용만 비교한다
const shape = (steps: ReportStep[]) =>
  steps.map((s) => [s.stepNo, s.kind, s.label, s.toolName, s.got, s.status])

// 화면이 1초마다 확인할 때 단계가 순서대로 하나씩 늘어나야 실시간으로 따라갈 수 있다
test('liveRun_overTime_addsStepsInOrder', () => {
  let prev = 0
  for (let ms = 0; ms <= 12_000; ms += 1_000) {
    const run = buildLiveRun(after(ms), start)
    assert.ok(run.steps.length >= prev, `${ms}ms`)
    prev = run.steps.length
    assert.deepEqual(
      run.steps.map((s) => s.stepNo),
      run.steps.map((_, i) => i + 1),
    )
    if (run.status === 'RUNNING') {
      // 진행 중인 단계는 마지막 하나뿐이고, 아직 받은 것이 없다
      const last = run.steps.at(-1)!
      assert.equal(run.currentStepNo, last.stepNo)
      assert.equal(last.status, 'RUNNING')
      assert.equal(last.got, null)
      assert.equal(last.durationMs, null)
      assert.ok(run.steps.slice(0, -1).every((s) => s.status !== 'RUNNING'))
      assert.equal(run.finishedAt, null)
    }
  }
  const first = buildLiveRun(start, start)
  assert.equal(first.status, 'RUNNING')
  assert.equal(first.steps.length, 1)
  assert.equal(first.steps[0].kind, 'REQUEST')
})

// AI 답이 구조 검증에서 떨어지면 다시 쓰는 장면이 기록에 남아야 한다
test('liveRun_whenDone_keepsFailedAttemptBeforeRetry', () => {
  const run = buildLiveRun(after(60_000), start)
  assert.equal(run.status, 'SUCCEEDED')
  assert.equal(run.currentStepNo, null)
  assert.ok(run.finishedAt)
  const failed = run.steps.findIndex((s) => s.kind === 'LLM_FAILED')
  assert.ok(failed > 0)
  assert.equal(run.steps[failed].status, 'FAILED')
  assert.equal(run.steps[failed + 1].kind, 'LLM')
  assert.equal(run.steps[failed + 1].status, 'DONE')
  assert.deepEqual(
    run.steps.slice(-2).map((s) => s.kind),
    ['VALIDATE', 'SAVE'],
  )
})

// 실시간으로 본 과정과 보고서의 "AI가 조사한 과정" 탭이 다르면 안 된다
test('finishedReportTrace_matchesLastRunSteps', async () => {
  const done = buildLiveRun(after(60_000), start)
  const live = buildMockReports(after(60_000)).find((r) => r.caseId === '102')!
  assert.deepEqual(shape(live.trace), shape(done.steps))
  for (const caseId of ['101', '201', '91', '180', '175']) {
    const report = await mockGetCaseReport(caseId)
    const run = await mockGetReportRun(caseId)
    assert.ok(report && run, caseId)
    assert.equal(run.status, 'SUCCEEDED', caseId)
    assert.equal(run.reportVersion, report.reportVersion, caseId)
    assert.deepEqual(shape(report.trace), shape(run.steps), caseId)
  }
})

// 조사가 끝나기 전에 보고서를 보여 주면 빈 결론을 믿고 판정한다
test('liveCaseReport_whileRunning_isNull', async () => {
  const run = await mockGetReportRun('102')
  assert.equal(run?.status, 'RUNNING')
  assert.equal(await mockGetCaseReport('102'), null)
})

// 비슷한 사건을 눌렀는데 보고서가 없거나 자기 자신이면 안 된다
test('similarCases_pointToEarlierClosedReports', async () => {
  const now = new Date('2026-10-24T03:00:00Z')
  const reports = new Map(buildMockReports(now).map((r) => [r.caseId, r]))
  let count = 0
  for (const report of reports.values()) {
    for (const s of report.similarCases) {
      count++
      const past = reports.get(s.caseId)
      assert.ok(past, `${report.caseId} → ${s.caseId}`)
      assert.notEqual(s.caseId, report.caseId)
      assert.equal(past.reportType, s.caseType)
      assert.ok(s.occurredAt < report.generatedAt)
      assert.ok(s.matches.length > 0)
      // 같은 대상이 겹치지 않으면 강하게 비슷하다고 하지 않는다
      if (s.matches.every((m) => m === 'RULE_COMBO')) assert.equal(s.strength, 'WEAK')
    }
  }
  assert.ok(count >= 3)
  const outcomes = reports.get('201')!.similarCases.map((s) => s.outcome)
  assert.deepEqual([...new Set(outcomes)].sort(), ['FRAUD', 'NORMAL'])
})

// 대상 직원이 조사 과정을 보면 어떤 증거가 잡혔는지 알아낸다
test('mockGetReportRun_staffCase_whenNotManager_rejects', async () => {
  setMockActor({ userId: 4, role: 'SECURITY_STAFF', displayName: '박지원' })
  await assert.rejects(mockGetReportRun('101'), StaffReportForbiddenError)
  await assert.rejects(mockGetReportRun('102'), StaffReportForbiddenError)
  await assert.rejects(mockGetCaseReport('91'), StaffReportForbiddenError)
  assert.equal((await mockGetReportRun('201'))?.status, 'SUCCEEDED')
  assert.equal(await mockGetReportRun('999'), null)
})
