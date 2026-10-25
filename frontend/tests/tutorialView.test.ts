import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { SCENARIOS } from '../src/config/scenarios.ts'
import { TUTORIAL_STEPS } from '../src/config/tutorialSteps.ts'
import {
  isDone,
  navTour,
  progressText,
  resolveStep,
  stepForPath,
} from '../src/utils/tutorialView.ts'
import {
  mockGetCaseReport,
  mockGetReportRun,
  mockStartBuyerRerun,
  resetMockReportRun,
} from '../src/api/mock/report.ts'

const steps = TUTORIAL_STEPS[1]

test('everyScenario_hasSteps', () => {
  for (const s of SCENARIOS) assert.ok(TUTORIAL_STEPS[s.id]?.length >= 3, s.title)
})

// 안내한 화면에 들어오면 그 단계로, 같은 주소가 이어지는 단계는 버튼으로 넘긴다
test('stepForPath_movesForwardOnly', () => {
  assert.equal(stepForPath(steps, 0, '/security/home'), 0)
  assert.equal(stepForPath(steps, 0, '/security/alerts'), 1)
  // 사건 화면에 처음 들어오면 그 주소의 첫 단계
  assert.equal(stepForPath(steps, 2, '/security/cases/201'), 3)
  // 보고서를 보고 사건 화면으로 돌아오면 판정 단계 (앞 단계로 돌아가지 않음)
  assert.equal(stepForPath(steps, 6, '/security/cases/201'), 7)
  // 안내에 없는 화면이면 그대로
  assert.equal(stepForPath(steps, 4, '/security/rules'), 4)
})

test('progressAndDone', () => {
  assert.equal(progressText(steps, 0), `1 / ${steps.length}단계`)
  assert.equal(isDone(steps, steps.length), true)
  assert.equal(navTour('/security/actions'), 'nav-security-actions')
})

// 이름표가 화면에서 사라지면 노란 테두리가 조용히 안 보인다 — 단계가 가리키는 이름표가 코드에 있는지
test('everyTarget_existsInSource', () => {
  const files = [
    'components/home/HomeParts.tsx',
    'pages/security/SecurityHomePage.tsx',
    'pages/manager/ManagerHomePage.tsx',
    'pages/owner/OwnerHomePage.tsx',
    'pages/security/AlertListPage.tsx',
    'pages/security/AlertDetailPage.tsx',
    'pages/security/CaseListPage.tsx',
    'pages/security/CaseDetailPage.tsx',
    'pages/security/ReportPage.tsx',
    'pages/manager/ApprovalsPage.tsx',
    'pages/owner/FundsPage.tsx',
    'pages/owner/LoanProductsPage.tsx',
    'components/tutorial/TutorialPanel.tsx',
  ]
  const source = files
    .map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'))
    .join('\n')
  for (const [id, list] of Object.entries(TUTORIAL_STEPS)) {
    for (const step of list) {
      if (!step.target) continue
      if (step.target.startsWith('nav-')) continue
      // alert-103 · case-102처럼 번호가 붙는 이름표는 앞부분으로, 여러 이름표를 단 요소는 그중 하나로 찾는다
      const name = step.target.replace(/-\d+$/, '-')
      const found =
        new RegExp(`data-tour="[^"]*\\b${step.target}\\b`).test(source) ||
        source.includes(`"${step.target}"`) ||
        source.includes(`\`${name}\${`)
      assert.ok(found, `${id}: ${step.target}`)
    }
  }
})

// 시나리오 ①: 구매자 답변이 오면 사건 201을 v2로 다시 조사하고, 조사 중에는 지난 보고서(v1)를 보여 준다
test('buyerRerun_showsOldReportUntilDone', async () => {
  resetMockReportRun()
  assert.equal((await mockGetReportRun('201'))?.status, 'SUCCEEDED')
  await mockStartBuyerRerun()
  const run = await mockGetReportRun('201')
  assert.equal(run?.status, 'RUNNING')
  assert.equal(run?.reportVersion, 2)
  assert.equal((await mockGetCaseReport('201'))?.reportVersion, 1)
  resetMockReportRun()
})

// [다음]으로 보고서 단계로 넘겼는데 아직 사건 화면이면, 판정 단계로 건너뛰지 않는다
test('resolveStep_keepsManualStepOnSamePage', () => {
  const casePath = '/security/cases/201'
  assert.equal(resolveStep(steps, { step: 6, path: casePath }, casePath), 6)
  assert.equal(resolveStep(steps, { step: 6, path: casePath }, '/security/cases/201/report'), 6)
  assert.equal(resolveStep(steps, { step: 6, path: '/security/cases/201/report' }, casePath), 7)
})
