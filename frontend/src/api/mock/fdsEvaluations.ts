// P2 결제 평가(경보) Mock — 시나리오 ① 결제 사기 · 카드 테스팅 · 차단 목록 재시도 (프로토타입 v4.2)
// 결제 번호는 api/mock/payment.ts와 같다 (31 = 사건 201). Rule 카탈로그 7일 적중도 여기서 만든다
// 테스트가 직접 불러오므로 import.meta.env를 읽는 mockMode는 쓰지 않는다
import { mockEpoch, mockRespond } from './respond.ts'
import { buildMockStaffAlerts, MOCK_RULES } from './fds.ts'
import { hitStats, HIT_DAYS } from '../../utils/ruleCatalog.ts'
import { PAYMENT_RULE_CODES, STAFF_RULE_CODES } from '../../types/fds.ts'
import type {
  FdsEvaluationDetail,
  FdsEvaluationPage,
  FdsEvaluationQuery,
  FdsResult,
  FdsRuleHit,
  PaymentRuleCode,
  RuleCode,
  RuleHitStat,
} from '../../types/fds.ts'

const minutesAgo = (now: Date, minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString()

const nameOf = (code: RuleCode) => MOCK_RULES.find((r) => r.ruleCode === code)?.displayName ?? code

// [Rule, 점수(0이면 미적중), 평가 당시 값]
type Hit = [PaymentRuleCode, number, string]

type Seed = {
  evaluationId: number
  paymentId: number
  customerRef: string
  customerLabel: string
  amount: number
  orderTitle: string
  minutes: number
  result: FdsResult
  caseId?: string
  errorCode?: string
  hits: Hit[]
  // 비교할 이력이 없어 판단하지 못한 Rule (UNAVAILABLE)
  unavailable?: PaymentRuleCode[]
}

// 점수 계산까지 간 평가는 차단 목록 미일치 + Rule 7개를 모두 남긴다. notes = 미적중 값을 바꿀 때
// Mock은 묶음 ② · ③까지 끝난 모습(R01~R08 모두 계산)을 보여 준다 (#96)
const scored = (
  matched: Partial<Record<PaymentRuleCode, [number, string]>>,
  notes: Partial<Record<PaymentRuleCode, string>> = {},
): Hit[] => {
  const all: [PaymentRuleCode, string][] = [
    ['BLOCKLIST', '차단 목록과 일치하는 값 없음'],
    ['HIGH_AMOUNT', '50만 원 미만'],
    ['NEW_DEVICE', '평소 결제하던 기기'],
    ['NEW_CARD', '이 카드로 결제 완료 이력 있음'],
    ['RAPID_REPEAT', '최근 10분 결제 1번'],
    ['HIGH_RISK_COUNTRY_IP', '고위험 국가 IP 아님'],
    ['CARD_TESTING', '같은 접속에서 1시간 카드 1장'],
    ['DECLINE_RETRY', '최근 10분 카드사 거절 없음'],
  ]
  return all.map(([code, normal]) => {
    const hit = matched[code]
    return hit ? [code, hit[0], hit[1]] : [code, 0, notes[code] ?? normal]
  })
}

const SEEDS: Seed[] = [
  {
    evaluationId: 106,
    paymentId: 34,
    customerRef: 'C-0601',
    customerLabel: '정하늘',
    amount: 12000,
    orderTitle: '조각 케이크',
    minutes: 3,
    result: 'DENY',
    unavailable: ['NEW_DEVICE', 'NEW_CARD'],
    hits: scored(
      {
        CARD_TESTING: [45, '같은 접속에서 1시간 안에 카드 3장 시도'],
        HIGH_RISK_COUNTRY_IP: [40, '네덜란드 익명 접속(VPN) · 고위험 국가'],
      },
      // 가입 40분 계정이라 비교할 이전 결제가 없다 (R02 · R03 미적용)
      {
        NEW_DEVICE: '이전 결제가 없어 비교 못 함',
        NEW_CARD: '이전 결제가 없어 비교 못 함',
      },
    ),
  },
  {
    evaluationId: 105,
    paymentId: 33,
    customerRef: 'C-0388',
    customerLabel: '이서연',
    amount: 38000,
    orderTitle: '딸기 생크림 케이크',
    minutes: 8,
    result: 'ALLOW',
    hits: scored({}),
  },
  {
    evaluationId: 104,
    paymentId: 32,
    customerRef: 'C-0510',
    customerLabel: '최유나',
    amount: 890000,
    orderTitle: '프리미엄 웨딩 케이크',
    minutes: 15,
    result: 'DENY',
    // 차단 목록과 일치하면 다른 Rule 점수 계산 없이 R07 100점으로 끝난다 (#100)
    hits: [['BLOCKLIST', 100, '접속 IP가 차단 목록과 일치 (VPN 대역 · 카드 테스팅 시도로 등록)']],
  },
  {
    evaluationId: 103,
    paymentId: 31,
    customerRef: 'C-0142',
    customerLabel: '김민수',
    amount: 650000,
    orderTitle: '단체 행사용 케이크 세트',
    minutes: 25,
    result: 'REVIEW',
    caseId: '201',
    hits: scored({
      HIGH_AMOUNT: [30, '65만 원 (50만 원 이상)'],
      NEW_CARD: [25, '이 카드로 결제 완료 0건'],
    }),
  },
  {
    evaluationId: 102,
    paymentId: 35,
    customerRef: 'C-0220',
    customerLabel: '오지훈',
    amount: 54000,
    orderTitle: '초코 케이크',
    minutes: 50,
    result: 'ALLOW',
    hits: scored({ DECLINE_RETRY: [35, '10분 안에 카드사 거절 2회 뒤 재시도'] }),
  },
  {
    evaluationId: 101,
    paymentId: 36,
    customerRef: 'C-0388',
    customerLabel: '이서연',
    amount: 42000,
    orderTitle: '치즈 케이크',
    minutes: 130,
    result: 'ERROR',
    errorCode: 'FDS_EVALUATION_TIMEOUT',
    hits: [],
  },
]

function toDetail(seed: Seed, now: Date): Omit<FdsEvaluationDetail, 'history'> {
  const at = minutesAgo(now, seed.minutes)
  const blocklisted = seed.hits.some(([code]) => code === 'BLOCKLIST') && seed.hits.length === 1
  const score = seed.hits.reduce((sum, [, points]) => sum + points, 0)
  const ruleHits: FdsRuleHit[] = seed.hits.map(([code, points, observed], i) => {
    const matched = points > 0 || (code === 'BLOCKLIST' && blocklisted)
    return {
      hitId: seed.evaluationId * 10 + i,
      ruleCode: code,
      ruleName: nameOf(code),
      outcome: matched ? 'MATCH' : seed.unavailable?.includes(code) ? 'UNAVAILABLE' : 'NO_MATCH',
      appliedScore: points,
      observedValue: observed,
      thresholdSnapshot: MOCK_RULES.find((r) => r.ruleCode === code)?.criteria ?? null,
    }
  })
  const hitRuleCodes = ruleHits
    .filter((h) => h.outcome === 'MATCH')
    .sort((a, b) => b.appliedScore - a.appliedScore)
    .map((h) => h.ruleCode as RuleCode)
  return {
    evaluation: {
      evaluationId: seed.evaluationId,
      paymentId: seed.paymentId,
      customerRef: seed.customerRef,
      // 화면 점수는 최대 100 (원래 합계는 백엔드 raw_score). 차단 목록 일치도 100점
      riskScore: seed.result === 'ERROR' ? null : Math.min(100, score),
      result: seed.result,
      evaluatedAt: at,
      errorCode: seed.errorCode ?? null,
      paymentRequestedAt: at,
      amount: seed.amount,
      orderTitle: seed.orderTitle,
      customerLabel: seed.customerLabel,
      hitRuleCodes,
      caseId: seed.caseId ?? null,
    },
    ruleHits,
  }
}

export function buildMockEvaluations(now: Date): FdsEvaluationDetail[] {
  const details = SEEDS.map((seed) => toDetail(seed, now))
  return details.map((d) => ({
    ...d,
    // 같은 고객의 다른 평가 (최신순)
    history: details
      .filter(
        (o) =>
          o.evaluation.customerRef === d.evaluation.customerRef &&
          o.evaluation.evaluationId !== d.evaluation.evaluationId,
      )
      .map((o) => o.evaluation),
  }))
}

const ATTENTION: FdsResult[] = ['REVIEW', 'DENY', 'ERROR']

export function mockGetFdsEvaluations(query: FdsEvaluationQuery = {}): Promise<FdsEvaluationPage> {
  const { result, attentionOnly = false, search, page = 0, size = 10 } = query
  const all = buildMockEvaluations(mockEpoch()).map((d) => d.evaluation)
  const word = search?.trim()
  const rows = all.filter(
    (e) =>
      (!result || e.result === result) &&
      (!attentionOnly || ATTENTION.includes(e.result)) &&
      (!word ||
        e.customerLabel.includes(word) ||
        (e.orderTitle ?? '').includes(word) ||
        String(e.paymentId) === word),
  )
  const resultCounts: Record<FdsResult, number> = { ALLOW: 0, REVIEW: 0, DENY: 0, ERROR: 0 }
  for (const e of all) resultCounts[e.result] += 1
  return mockRespond({
    content: rows.slice(page * size, (page + 1) * size),
    page,
    size,
    totalElements: rows.length,
    totalPages: Math.max(1, Math.ceil(rows.length / size)),
    resultCounts,
  })
}

export function mockGetFdsEvaluation(evaluationId: string): Promise<FdsEvaluationDetail | null> {
  const found = buildMockEvaluations(mockEpoch()).find(
    (d) => String(d.evaluation.evaluationId) === evaluationId,
  )
  return mockRespond(found ?? null)
}

// 지난 6일 결제 Rule 하루 적중 수 (6일 전 → 1일 전). 오늘은 위 평가에서 센다
const PAST_PAYMENT_HITS: Partial<Record<RuleCode, number[]>> = {
  BLOCKLIST: [0, 0, 1, 0, 1, 0],
  HIGH_AMOUNT: [2, 1, 3, 0, 2, 1],
  NEW_DEVICE: [1, 0, 2, 0, 1, 1],
  NEW_CARD: [3, 2, 4, 1, 3, 2],
  RAPID_REPEAT: [1, 2, 1, 1, 0, 2],
  HIGH_RISK_COUNTRY_IP: [0, 1, 0, 1, 0, 0],
  CARD_TESTING: [0, 0, 1, 0, 0, 0],
  DECLINE_RETRY: [1, 0, 0, 2, 1, 0],
}

// Rule 적중 시각 — 결제 평가 MATCH + 직원 경보
export function buildMockRuleHits(now: Date): { ruleCode: RuleCode; at: string }[] {
  const hits: { ruleCode: RuleCode; at: string }[] = []
  for (const d of buildMockEvaluations(now)) {
    for (const h of d.ruleHits) {
      if (h.outcome === 'MATCH') {
        hits.push({ ruleCode: h.ruleCode as RuleCode, at: d.evaluation.evaluatedAt })
      }
    }
  }
  for (const [code, counts] of Object.entries(PAST_PAYMENT_HITS)) {
    counts?.forEach((count, i) => {
      const day = 6 - i
      for (let n = 0; n < count; n++) {
        hits.push({ ruleCode: code as RuleCode, at: minutesAgo(now, day * 1440 + 60 + n * 47) })
      }
    })
  }
  for (const alert of buildMockStaffAlerts(now)) {
    hits.push({ ruleCode: alert.ruleCode, at: alert.detectedAt })
  }
  return hits
}

export function mockGetRuleHitStats(days = HIT_DAYS): Promise<RuleHitStat[]> {
  const now = new Date()
  const codes = [...PAYMENT_RULE_CODES, ...STAFF_RULE_CODES]
  return mockRespond(hitStats(buildMockRuleHits(mockEpoch()), codes, now, days))
}
