// P2 fds 계약 — 값은 fds_rules · blocklist_entries · staff_rule_hits와 같은 문자열 (docs/erd 7절)
// 결제 평가(경보) 타입도 여기 둔다 — api/fds.ts는 기존 화면을 위해 다시 내보낸다

// 결제 Rule R01~R08 순 (fds_rules.display_code, #96)
export const PAYMENT_RULE_CODES = [
  'HIGH_AMOUNT',
  'NEW_DEVICE',
  'NEW_CARD',
  'RAPID_REPEAT',
  'HIGH_RISK_COUNTRY_IP',
  'CARD_TESTING',
  'BLOCKLIST',
  'DECLINE_RETRY',
] as const
// 폐지한 결제 Rule (#96) — 카탈로그에는 없고, 과거 평가 기록에만 남아 있을 수 있다
export const RETIRED_PAYMENT_RULE_CODES = ['AMOUNT_SPIKE', 'NEW_ACCOUNT', 'GEO_MISMATCH'] as const
export const STAFF_RULE_CODES = [
  'STAFF_LOGIN_FAIL',
  'STAFF_NEW_DEVICE',
  'CONCURRENT_SESSION',
  'DECISION_ANOMALY',
  'CONFIG_WEAKEN',
  'STAFF_DISTRIBUTED',
  'PASSWORD_SPRAY',
] as const

export type PaymentRuleCode = (typeof PAYMENT_RULE_CODES)[number]
export type RetiredPaymentRuleCode = (typeof RETIRED_PAYMENT_RULE_CODES)[number]
export type StaffRuleCode = (typeof STAFF_RULE_CODES)[number]
export type RuleCode = PaymentRuleCode | RetiredPaymentRuleCode | StaffRuleCode

export type RuleTarget = 'PAYMENT' | 'STAFF'
// SCORE = 점수 더하기, DENY = 점수 계산 없이 거절, ALERT = 직원 경보
export type RuleAction = 'SCORE' | 'DENY' | 'ALERT'
export type Severity = 'CAUTION' | 'HIGH'

// Rule 카탈로그 1행 (fds_rules)
export type FdsRule = {
  ruleId: number
  ruleCode: RuleCode
  // 결제 Rule 표시 번호 R01~R08, 직원 Rule은 null (#96)
  displayCode: string | null
  target: RuleTarget
  displayName: string
  criteria: string
  action: RuleAction
  score: number
  severity: Severity | null
  threshold: Record<string, unknown> | null
  enabled: boolean
  updatedBy: number | null
  updatedAt: string
}

export type BlocklistType = 'CARD' | 'IP' | 'EMAIL' | 'DEVICE'
// STAFF = 직원이 직접 등록, CASE = 사건 판정에서 등록
export type BlocklistSource = 'STAFF' | 'CASE'

// 차단 목록 1건. CARD의 entryValue는 화면용 마스킹 값 (원문 카드번호는 주고받지 않는다)
export type BlocklistEntry = {
  entryId: number
  entryType: BlocklistType
  entryValue: string
  reason: string
  source: BlocklistSource
  sourceRef: number | null
  createdBy: number | null
  createdAt: string
  expiresAt: string | null
  releasedAt: string | null
  releasedBy: number | null
  // 최근 7일 이 값으로 차단한 결제 수 · 마지막 차단 시각
  hits7d: number
  lastHitAt: string | null
}

export type NewBlocklistEntry = {
  entryType: BlocklistType
  entryValue: string
  reason: string
  expiresAt?: string
}

// 직원 경보 1건 (staff_rule_hits). 패스워드 스프레이처럼 여러 계정이면 userId가 null
export type StaffAlert = {
  staffHitId: number
  userId: number | null
  loginEventId: number | null
  ruleCode: StaffRuleCode
  severity: Severity
  summary: string
  observedValue: Record<string, unknown> | null
  windowStart: string | null
  windowEnd: string | null
  detectedAt: string
}

export type StaffAlertQuery = {
  userId?: number
  from?: string
  severity?: Severity
}

// Rule별 최근 적중 (GET /fds/rules/hit-stats?days=7). 결제 Rule 적중(MATCH)과 직원 경보를 합친다
export type RuleHitStat = {
  ruleCode: RuleCode
  // 하루별 적중 수, 오래된 날 → 오늘 (한국 시간 날짜 기준, 길이 = days)
  daily: number[]
  total: number
  // 기간과 관계없이 마지막 적중 시각, 없으면 null
  lastHitAt: string | null
}

// 결제 평가 (fds_evaluations). ERROR = 평가 실패
export type FdsResult = 'ALLOW' | 'REVIEW' | 'DENY' | 'ERROR'
export type FdsRuleHitOutcome = 'MATCH' | 'NO_MATCH' | 'UNAVAILABLE'

// 경보 목록 1행. amount ~ caseId는 1-4 보강 — 목록이 결제 · 사건을 따로 부르지 않게
export type FdsEvaluationSummary = {
  evaluationId: number
  paymentId: number
  customerRef: string
  riskScore: number | null
  result: FdsResult
  evaluatedAt: string
  errorCode: string | null
  paymentRequestedAt: string
  amount: number
  orderTitle: string | null
  // 화면용 고객 이름 (예: 김민수)
  customerLabel: string
  // 적중(MATCH)한 Rule만, 점수 큰 순
  hitRuleCodes: RuleCode[]
  // REVIEW로 사건에 묶였으면 그 사건
  caseId: string | null
}

export type FdsRuleHit = {
  hitId: number
  ruleCode: string
  ruleName: string
  outcome: FdsRuleHitOutcome
  appliedScore: number
  // 평가 당시 값 · 기준값 (서버가 사람 말로 준다)
  observedValue: string | null
  thresholdSnapshot: string | null
}

export type FdsEvaluationDetail = {
  evaluation: FdsEvaluationSummary
  ruleHits: FdsRuleHit[]
  history: FdsEvaluationSummary[]
}

export type FdsEvaluationPage = {
  content: FdsEvaluationSummary[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  resultCounts: Record<FdsResult, number>
}

export type FdsEvaluationQuery = {
  result?: FdsResult
  attentionOnly?: boolean
  search?: string
  page?: number
  size?: number
}
