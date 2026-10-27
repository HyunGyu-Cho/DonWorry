import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildMockBlocklist } from '../src/api/mock/fds.ts'
import {
  buildMockEvaluations,
  mockGetFdsEvaluation,
  mockGetFdsEvaluations,
} from '../src/api/mock/fdsEvaluations.ts'
import { buildMockPayments } from '../src/api/mock/payment.ts'
import type { FdsEvaluationDetail } from '../src/types/fds.ts'
import {
  blockCandidates,
  blocklistValueLabel,
  maskEmail,
  paymentFacts,
  verdict,
} from '../src/utils/paymentAlert.ts'

const now = new Date('2026-10-24T06:00:00Z')
const evals = buildMockEvaluations(now)
const payments = buildMockPayments(now)
const byPayment = (id: number) =>
  evals.find((d) => d.evaluation.paymentId === id) as FdsEvaluationDetail
const paymentOf = (id: number) => payments.find((p) => p.paymentId === String(id)) ?? null

// 점수 합 · 판정 · 걸린 Rule 목록이 서로 맞아야 화면 설명이 거짓말을 하지 않는다
test('mockEvaluations_scoreMatchesHitsAndBand', () => {
  for (const d of evals) {
    const e = d.evaluation
    const sum = d.ruleHits.reduce((s, h) => s + h.appliedScore, 0)
    // 화면 점수는 합계를 100에서 자른 값 (#96)
    if (e.riskScore !== null)
      assert.equal(e.riskScore, Math.min(100, sum), `평가 ${e.evaluationId}`)
    const matched = d.ruleHits.filter((h) => h.outcome === 'MATCH').map((h) => h.ruleCode)
    assert.deepEqual([...e.hitRuleCodes].sort(), [...matched].sort())
    // 결제 정보가 Mock 결제와 같다
    const p = paymentOf(e.paymentId)
    assert.ok(p, `결제 ${e.paymentId} 없음`)
    assert.equal(p.amount, e.amount)
  }
  const fraud = byPayment(31).evaluation
  assert.equal(fraud.riskScore, 55)
  assert.equal(fraud.result, 'REVIEW')
  assert.equal(fraud.caseId, '201')
  // 카드 테스팅 45 + 고위험 국가 IP 40 = 85 거절 (룰안 시나리오)
  assert.equal(byPayment(34).evaluation.riskScore, 85)
  assert.equal(byPayment(34).evaluation.result, 'DENY')
})

test('verdict_labelsAndMeaning', () => {
  assert.equal(verdict(byPayment(31).evaluation).label, '직원 확인')
  assert.equal(verdict(byPayment(34).evaluation).label, '거절')
  const blocked = verdict(byPayment(32).evaluation)
  assert.equal(blocked.label, '차단')
  assert.match(blocked.meaning, /점수를 계산하지 않고/)
  assert.equal(verdict(byPayment(36).evaluation).label, '평가 실패')
})

// "평소와 다른 점"은 걸린 Rule과 같아야 한다 (화면이 따로 판단하지 않음)
test('paymentFacts_followRuleHits', () => {
  const fraud = paymentFacts(byPayment(31), paymentOf(31))
  const text = (label: string) => fraud.find((f) => f.label === label)
  assert.match(text('카드')?.text ?? '', /처음 쓰는 카드/)
  assert.equal(text('카드')?.tone, 'warn')
  assert.match(text('금액')?.text ?? '', /50만 원 이상 고액/)
  assert.equal(text('접속')?.tone, 'ok')
  assert.equal(text('계정')?.tone, 'ok')

  const testing = paymentFacts(byPayment(34), paymentOf(34))
  assert.equal(testing.find((f) => f.label === '접속')?.tone, 'bad')
  assert.match(testing.find((f) => f.label === '계정')?.text ?? '', /가입 40분 만에/)
  assert.ok(testing.some((f) => f.label === '시도' && f.tone === 'bad'))
  // 과거 정상 결제가 없으면 카드를 평소와 비교할 수 없다고 말한다 (R03 확인 불가)
  const of34 = (label: string) => testing.find((f) => f.label === label)
  assert.equal(of34('카드')?.tone, 'muted')
  assert.match(of34('카드')?.text ?? '', /비교할 수 없어요/)
  // 금액은 고정 기준(50만 원)과만 비교한다
  assert.equal(of34('금액')?.tone, 'ok')
  // 자동화 브라우저는 정상(✅)으로 보이지 않는다
  assert.equal(of34('기기')?.tone, 'warn')

  // 차단 목록 일치면 비교 없이 한 줄
  const blocked = paymentFacts(byPayment(32), paymentOf(32))
  assert.equal(blocked.length, 1)
  assert.equal(blocked[0].tone, 'bad')
  // 화면 문장에 IP · 기기 ID · 이메일 원문이 없다
  for (const f of [...fraud, ...testing, ...blocked]) {
    assert.doesNotMatch(f.text, /\d+\.\d+\.\d+\.\d+|DEV-|@/)
  }
})

test('blockCandidates_marksAlreadyBlocked_andHidesRawValues', () => {
  const blocklist = buildMockBlocklist(now)
  // 결제 32의 IP는 이미 차단 목록에 있다
  const c = blockCandidates(paymentOf(32), blocklist)
  assert.deepEqual(
    c.map((x) => [x.type, x.already]),
    [
      ['CARD', false],
      ['DEVICE', false],
      ['IP', true],
      ['EMAIL', false],
    ],
  )
  assert.equal(c[0].value, '**** 4402')
  // IP만 여러 사람이 같이 쓸 수 있어 주의, 나머지는 추천
  assert.deepEqual(
    c.map((x) => x.advice),
    ['recommend', 'recommend', 'caution', 'recommend'],
  )
  for (const x of c) assert.doesNotMatch(x.label, /\d+\.\d+\.\d+\.\d+|DEV-|yuna\./)
  assert.equal(maskEmail('minsu.kim@example.com'), 'm********@example.com')
  assert.equal(
    blocklistValueLabel({ entryType: 'CARD', entryValue: '**** 7760' }),
    '끝자리 7760 카드',
  )
  assert.equal(blocklistValueLabel({ entryType: 'IP', entryValue: '45.83.64.12' }), null)
})

test('mockGetFdsEvaluations_filtersAndCounts', async () => {
  const attention = await mockGetFdsEvaluations({ attentionOnly: true })
  assert.ok(attention.content.every((e) => e.result !== 'ALLOW'))
  assert.deepEqual(attention.resultCounts, { ALLOW: 2, REVIEW: 1, DENY: 2, ERROR: 1 })
  const search = await mockGetFdsEvaluations({ search: '김민수' })
  assert.deepEqual(
    search.content.map((e) => e.paymentId),
    [31],
  )
  assert.equal(await mockGetFdsEvaluation('999'), null)
  const detail = await mockGetFdsEvaluation('103')
  assert.equal(detail?.evaluation.customerLabel, '김민수')
})
