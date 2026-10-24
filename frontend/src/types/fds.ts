// P2 fds 계약 — 값은 fds_rules · blocklist_entries · staff_rule_hits와 같은 문자열 (docs/erd 7절)
// 결제 평가 결과 타입(FdsResult 등)은 기존 화면이 쓰는 api/fds.ts에 있다

export const PAYMENT_RULE_CODES = [
  'BLOCKLIST',
  'HIGH_AMOUNT',
  'AMOUNT_SPIKE',
  'NEW_CARD',
  'NEW_ACCOUNT',
  'CARD_TESTING',
  'DECLINE_RETRY',
  'GEO_MISMATCH',
] as const
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
export type StaffRuleCode = (typeof STAFF_RULE_CODES)[number]
export type RuleCode = PaymentRuleCode | StaffRuleCode

export type RuleTarget = 'PAYMENT' | 'STAFF'
// SCORE = 점수 더하기, DENY = 점수 계산 없이 거절, ALERT = 직원 경보
export type RuleAction = 'SCORE' | 'DENY' | 'ALERT'
export type Severity = 'CAUTION' | 'HIGH'

// Rule 카탈로그 1행 (fds_rules)
export type FdsRule = {
  ruleId: number
  ruleCode: RuleCode
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
}

export type NewBlocklistEntry = {
  entryType: BlocklistType
  entryValue: string
  reason: string
  expiresAt?: string
}

// 직원 경보 1건 (staff_rule_hits). 비밀번호 뿌리기처럼 여러 계정이면 userId가 null
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
