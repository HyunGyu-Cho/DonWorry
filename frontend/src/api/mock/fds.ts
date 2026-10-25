// P2 fds Mock — Rule은 seed_fds_rules와 같고, 차단 목록 · 직원 경보는 프로토타입 v3.1 시나리오
// 테스트가 직접 불러오므로 import.meta.env를 읽는 mockMode는 쓰지 않는다
import { RuleActionForbiddenError, RuleAlreadyEnabledError } from '../fdsErrors.ts'
import { mockRespond } from './respond.ts'
import { getMockActor, mockApprovedRuleDisables } from './investigation.ts'
import { canToggle, hitStats, HIT_DAYS } from '../../utils/ruleCatalog.ts'
import { PAYMENT_RULE_CODES, STAFF_RULE_CODES } from '../../types/fds.ts'
import type {
  BlocklistEntry,
  FdsRule,
  NewBlocklistEntry,
  RuleAction,
  RuleCode,
  RuleHitStat,
  Severity,
  StaffAlert,
  StaffAlertQuery,
} from '../../types/fds.ts'

const SEEDED_AT = '2026-10-24T01:20:18.000000Z'

const rule = (
  ruleId: number,
  ruleCode: RuleCode,
  displayName: string,
  criteria: string,
  action: RuleAction,
  score: number,
  severity: Severity | null,
  threshold: Record<string, unknown> | null,
): FdsRule => ({
  ruleId,
  ruleCode,
  target: action === 'ALERT' ? 'STAFF' : 'PAYMENT',
  displayName,
  criteria,
  action,
  score,
  severity,
  threshold,
  enabled: true,
  updatedBy: null,
  updatedAt: SEEDED_AT,
})

// rule_id는 빈 DB에 시드가 들어간 순서와 같다
export const MOCK_RULES: FdsRule[] = [
  rule(
    1,
    'BLOCKLIST',
    '차단 목록 일치',
    '과거 사기로 판정된 카드 · 기기 · IP · 이메일과 일치',
    'DENY',
    0,
    null,
    null,
  ),
  rule(
    2,
    'HIGH_AMOUNT',
    '고액 결제',
    '결제 금액 50만 원 이상 +20점, 100만 원 이상 +35점',
    'SCORE',
    20,
    null,
    {
      tiers: [
        { minAmount: 500000, score: 20 },
        { minAmount: 1000000, score: 35 },
      ],
    },
  ),
  rule(
    3,
    'AMOUNT_SPIKE',
    '평소보다 큰 금액',
    '이 고객의 평균 결제 금액의 5배 이상',
    'SCORE',
    20,
    null,
    {
      multiplier: 5,
    },
  ),
  rule(
    4,
    'NEW_CARD',
    '처음 쓰는 카드',
    '이 고객이 이 카드로 결제를 완료한 이력 0건',
    'SCORE',
    15,
    null,
    null,
  ),
  rule(
    5,
    'NEW_ACCOUNT',
    '신규 계정 결제',
    'CakeShop 가입 24시간 이내 계정의 결제',
    'SCORE',
    20,
    null,
    {
      withinHours: 24,
    },
  ),
  rule(
    6,
    'CARD_TESTING',
    '카드 테스팅',
    '같은 IP에서 1시간 안에 서로 다른 카드 3장 이상 (이번 결제 포함)',
    'SCORE',
    45,
    null,
    { windowMinutes: 60, minCards: 3 },
  ),
  rule(
    7,
    'DECLINE_RETRY',
    '거절 후 재시도',
    '같은 카드가 10분 안에 카드사 거절 2회 이상',
    'SCORE',
    30,
    null,
    {
      windowMinutes: 10,
      minDeclines: 2,
    },
  ),
  rule(
    8,
    'GEO_MISMATCH',
    '해외 · 익명 접속',
    '카드 발급국 ≠ 접속 국가, 또는 VPN · Tor 같은 익명 IP',
    'SCORE',
    25,
    null,
    null,
  ),
  rule(
    9,
    'STAFF_LOGIN_FAIL',
    '로그인 · OTP 실패 반복',
    '계정당 10분 안 비밀번호 또는 OTP 실패 3회 이상',
    'ALERT',
    0,
    'CAUTION',
    { windowMinutes: 10, minFailures: 3 },
  ),
  rule(
    10,
    'STAFF_NEW_DEVICE',
    '사내망 밖 · 새 기기 접속',
    '등록된 사내 IP · 업무 PC가 아닌 곳에서 로그인 또는 세션 사용',
    'ALERT',
    0,
    'CAUTION',
    null,
  ),
  rule(
    11,
    'CONCURRENT_SESSION',
    '세션 동시 사용',
    '같은 세션이 서로 다른 IP · 기기에서 동시에 사용됨',
    'ALERT',
    0,
    'HIGH',
    null,
  ),
  rule(
    12,
    'DECISION_ANOMALY',
    '판정 이상',
    '30분 안에 AI 권고와 반대로 매입 허용 3건 이상 시도, 또는 재인증 실패',
    'ALERT',
    0,
    'HIGH',
    { windowMinutes: 30, minOverrides: 3 },
  ),
  rule(
    13,
    'CONFIG_WEAKEN',
    '탐지 설정 완화',
    'Rule 끄기 · 기준값 완화 · 허용 목록 추가 요청',
    'ALERT',
    0,
    'CAUTION',
    null,
  ),
  rule(
    14,
    'STAFF_DISTRIBUTED',
    '분산 로그인 실패',
    '한 계정에 10분 안 서로 다른 IP 5개 이상에서 로그인 실패',
    'ALERT',
    0,
    'HIGH',
    { windowMinutes: 10, minIps: 5 },
  ),
  rule(
    15,
    'PASSWORD_SPRAY',
    '비밀번호 뿌리기',
    '한 IP가 10분 안에 직원 계정 2개 이상에 로그인 시도',
    'ALERT',
    0,
    'HIGH',
    { windowMinutes: 10, minAccounts: 2 },
  ),
]

const daysAgo = (now: Date, days: number) =>
  new Date(now.getTime() - days * 86_400_000).toISOString()
const minutesAgo = (now: Date, minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString()

export function buildMockBlocklist(now: Date): BlocklistEntry[] {
  const entry = (
    entryId: number,
    entryType: BlocklistEntry['entryType'],
    entryValue: string,
    reason: string,
    source: BlocklistEntry['source'],
    days: number,
  ): BlocklistEntry => ({
    entryId,
    entryType,
    entryValue,
    reason,
    source,
    sourceRef: source === 'CASE' ? 900 + entryId : null,
    createdBy: 4,
    createdAt: daysAgo(now, days),
    expiresAt: null,
    releasedAt: null,
    releasedBy: null,
  })
  return [
    entry(1, 'CARD', '**** 7760', '10/12 사기 판정 사건 · 도용 카드', 'CASE', 11),
    entry(2, 'DEVICE', 'DEV-0C91', '카드 테스팅 기기 · 결제 7회 시도', 'CASE', 5),
    entry(3, 'IP', '45.83.64.12', 'VPN 대역 · 카드 테스팅 시도', 'STAFF', 2),
    entry(4, 'EMAIL', 'qx7k2@tempmail.example', '일회용 메일 · 신규 계정 사기 시도', 'STAFF', 1),
  ]
}

// 0-2 Mock 로그인 기록과 같은 장면 (박지원 탈취 · 분산 공격)
export function buildMockStaffAlerts(now: Date): StaffAlert[] {
  const alert = (
    staffHitId: number,
    userId: number | null,
    ruleCode: StaffAlert['ruleCode'],
    severity: Severity,
    summary: string,
    minutes: number,
    observedValue: Record<string, unknown> | null = null,
  ): StaffAlert => ({
    staffHitId,
    userId,
    loginEventId: null,
    ruleCode,
    severity,
    summary,
    observedValue,
    windowStart: null,
    windowEnd: null,
    detectedAt: minutesAgo(now, minutes),
  })
  return [
    alert(6, null, 'PASSWORD_SPRAY', 'HIGH', '같은 IP가 박지원 · 이도현 계정에 차례로 시도', 1, {
      accounts: ['jiwon', 'dohyun'],
    }),
    alert(
      5,
      4,
      'STAFF_DISTRIBUTED',
      'HIGH',
      '박지원 계정 · 해외 IP 30개에서 10분 안 실패 40회',
      1,
      {
        ips: 30,
        failures: 40,
      },
    ),
    alert(4, 4, 'CONFIG_WEAKEN', 'HIGH', '"고액 결제" Rule 끄기 요청 (탈취 의심 세션)', 30),
    alert(
      3,
      4,
      'CONCURRENT_SESSION',
      'HIGH',
      '박지원 세션이 사내 PC와 해외 Tor IP에서 동시에 사용',
      40,
    ),
    alert(2, 4, 'STAFF_LOGIN_FAIL', 'CAUTION', '박지원 · 비밀번호 성공 후 OTP 3회 실패', 93, {
      otpFailures: 3,
    }),
    alert(1, 4, 'STAFF_NEW_DEVICE', 'CAUTION', '박지원 · 집 IP에서 로그인 (새 기기)', 780),
    // 지난 사건 91 (재택근무로 확인 · 경고 해제) — 보고서의 비슷한 과거 사건
    alert(7, 4, 'STAFF_NEW_DEVICE', 'CAUTION', '박지원 · 집에서 로그인 (재택근무)', 24 * 24 * 60),
  ]
}

// 화면에서 추가한 항목 · 다시 켠 시각은 새로고침 전까지만 남는다
const addedEntries: BlocklistEntry[] = []
const enabledAt = new Map<number, { at: string; by: number }>()

// 테스트 · 시연 다시 시작용
export function resetMockFds() {
  addedEntries.length = 0
  enabledAt.clear()
}

// 승인된 끄기 요청이 마지막 다시 켜기보다 나중이면 꺼진 Rule
function currentRules(): FdsRule[] {
  const disables = mockApprovedRuleDisables()
  return MOCK_RULES.map((rule) => {
    const on = enabledAt.get(rule.ruleId)
    const off = disables
      .filter((d) => d.ruleId === rule.ruleId && (!on || d.decidedAt > on.at))
      .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0]
    if (off) return { ...rule, enabled: false, updatedAt: off.decidedAt }
    if (on) return { ...rule, enabled: true, updatedBy: on.by, updatedAt: on.at }
    return rule
  })
}

export function mockGetRules(): Promise<FdsRule[]> {
  return mockRespond(currentRules())
}

// 다시 켜기는 규칙을 강화하는 쪽이라 승인 없이 바로 반영된다
export async function mockEnableRule(ruleId: number): Promise<FdsRule> {
  await mockRespond(null)
  const actor = getMockActor()
  const rule = currentRules().find((r) => r.ruleId === ruleId)
  if (!rule) throw new Error(`Rule ${ruleId}을 찾을 수 없습니다.`)
  const security = actor.role === 'SECURITY_STAFF' || actor.role === 'SECURITY_MANAGER'
  if (!security || !canToggle(rule)) throw new RuleActionForbiddenError()
  if (rule.enabled) throw new RuleAlreadyEnabledError()
  enabledAt.set(ruleId, { at: new Date().toISOString(), by: actor.userId })
  return structuredClone(currentRules().find((r) => r.ruleId === ruleId) as FdsRule)
}

// 결제 Rule 적중 (분 전). 오늘은 시연 시나리오, 지난 6일은 평소 수준
// 결제 사기 15분 전 (고액 · 평소 5배 · 처음 쓰는 카드), 카드 테스팅 3분 전, 차단 목록 재시도 2분 전, 거절 후 재시도 50분 전
const TODAY_PAYMENT_HITS: [RuleCode, number][] = [
  ['BLOCKLIST', 2],
  ['CARD_TESTING', 3],
  ['NEW_ACCOUNT', 3],
  ['GEO_MISMATCH', 3],
  ['DECLINE_RETRY', 50],
  ['HIGH_AMOUNT', 15],
  ['AMOUNT_SPIKE', 15],
  ['NEW_CARD', 15],
]
// 6일 전 → 1일 전 하루 적중 수
const PAST_PAYMENT_HITS: Partial<Record<RuleCode, number[]>> = {
  BLOCKLIST: [0, 1, 0, 0, 1, 0],
  HIGH_AMOUNT: [2, 1, 3, 0, 2, 1],
  AMOUNT_SPIKE: [1, 0, 2, 0, 1, 1],
  NEW_CARD: [3, 2, 4, 1, 3, 2],
  NEW_ACCOUNT: [1, 2, 1, 1, 0, 2],
  CARD_TESTING: [0, 0, 1, 0, 0, 0],
  DECLINE_RETRY: [1, 0, 0, 2, 1, 0],
  GEO_MISMATCH: [0, 1, 0, 1, 0, 0],
}

export function buildMockRuleHits(now: Date): { ruleCode: RuleCode; at: string }[] {
  const hits = TODAY_PAYMENT_HITS.map(([ruleCode, minutes]) => ({
    ruleCode,
    at: minutesAgo(now, minutes),
  }))
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
  return mockRespond(hitStats(buildMockRuleHits(now), codes, now, days))
}

export function mockGetBlocklist(activeOnly = true): Promise<BlocklistEntry[]> {
  const rows = [...addedEntries, ...buildMockBlocklist(new Date())]
  return mockRespond(activeOnly ? rows.filter((row) => row.releasedAt === null) : rows)
}

export function mockAddBlocklistEntry(input: NewBlocklistEntry): Promise<BlocklistEntry> {
  const created: BlocklistEntry = {
    entryId: 100 + addedEntries.length,
    entryType: input.entryType,
    entryValue: input.entryValue,
    reason: input.reason,
    source: 'STAFF',
    sourceRef: null,
    createdBy: 4,
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt ?? null,
    releasedAt: null,
    releasedBy: null,
  }
  addedEntries.unshift(created)
  return mockRespond(created)
}

export function mockGetStaffAlerts(query: StaffAlertQuery = {}): Promise<StaffAlert[]> {
  const rows = buildMockStaffAlerts(new Date()).filter(
    (row) =>
      (query.userId === undefined || row.userId === query.userId) &&
      (!query.severity || row.severity === query.severity) &&
      (!query.from || row.detectedAt >= query.from),
  )
  return mockRespond(rows)
}
