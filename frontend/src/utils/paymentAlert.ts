// 결제 경보 · 차단 목록 화면(1-4)의 계산 — React 없이 순수 함수만 (node 테스트가 직접 불러온다)
// "평소와 다른 점"은 화면이 따로 비교하지 않고 백엔드 Rule 적중 결과로만 정한다
import { SCORE_BANDS } from '../config/fdsRules.ts'
import type {
  BlocklistEntry,
  BlocklistType,
  FdsEvaluationDetail,
  FdsEvaluationSummary,
  FdsResult,
  RuleCode,
} from '../types/fds.ts'
import type { ApprovalRequest } from '../types/investigation.ts'
import type { PaymentContext } from '../types/payment.ts'
import { cardName, countryName, koreanWon, placeName } from './humanize.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const isBlocklisted = (e: Pick<FdsEvaluationSummary, 'hitRuleCodes'>) =>
  e.hitRuleCodes.includes('BLOCKLIST')

export type Tone = 'ok' | 'warn' | 'bad' | 'muted'
// antd Tag 색
export const TONE_COLOR: Record<Tone, string> = {
  ok: 'green',
  warn: 'gold',
  bad: 'red',
  muted: 'default',
}

export type Verdict = { label: string; tone: Tone; meaning: string }

const band = (result: string) => SCORE_BANDS.find((b) => b.result === result)

// 판정 이름과 뜻 한 줄
export function verdict(e: Pick<FdsEvaluationSummary, 'result' | 'hitRuleCodes'>): Verdict {
  if (e.result === 'ERROR') {
    return {
      label: '평가 실패',
      tone: 'muted',
      meaning: '점수를 계산하지 못했어요. 결제를 멈춰 두었으니 직원이 직접 확인해 주세요.',
    }
  }
  if (e.result === 'DENY' && isBlocklisted(e)) {
    return {
      label: '차단',
      tone: 'bad',
      meaning: '차단 목록과 일치해 점수를 계산하지 않고 바로 막았어요.',
    }
  }
  const labels: Record<Exclude<FdsResult, 'ERROR'>, [string, Tone]> = {
    DENY: ['거절', 'bad'],
    REVIEW: ['직원 확인', 'warn'],
    ALLOW: ['통과', 'ok'],
  }
  const [label, tone] = labels[e.result]
  return { label, tone, meaning: band(e.result)?.meaning ?? '' }
}

export type Fact = { label: string; text: string; tone: Exclude<Tone, 'muted'> }

// 결제 한 건을 카드 · 접속 · 기기 · 계정 · 금액 · 시도 순서로 한 줄씩
export function paymentFacts(
  detail: Pick<FdsEvaluationDetail, 'ruleHits'>,
  ctx: PaymentContext | null,
): Fact[] {
  const hit = new Set(
    detail.ruleHits.filter((h) => h.outcome === 'MATCH').map((h) => h.ruleCode as RuleCode),
  )
  if (hit.has('BLOCKLIST')) {
    return [{ label: '차단', text: '과거 사기로 확인된 값과 일치해요', tone: 'bad' }]
  }
  const facts: Fact[] = []
  const card = cardName(ctx?.cardLast4 ?? null)
  const issued = ctx?.cardCountry ? `${countryName(ctx.cardCountry)} 발급` : null
  const cardDesc = [card, issued].filter(Boolean).join(', ')
  facts.push(
    hit.has('NEW_CARD')
      ? { label: '카드', text: `이 고객이 처음 쓰는 카드예요 (${cardDesc})`, tone: 'warn' }
      : { label: '카드', text: `평소 쓰던 카드예요 (${cardDesc})`, tone: 'ok' },
  )
  const ip = ctx?.ip ?? null
  const where = ip ? placeName(ip.label) : '확인되지 않은 접속 위치'
  if (hit.has('GEO_MISMATCH') && ip?.ipType === 'ANONYMOUS') {
    facts.push({ label: '접속', text: `VPN · Tor 같은 익명 접속이에요 · ${where}`, tone: 'bad' })
  } else if (hit.has('GEO_MISMATCH')) {
    const from = ip ? countryName(ip.countryCode) : '다른 나라'
    facts.push({
      label: '접속',
      text: `카드는 ${issued ?? '다른 나라 발급'}인데 ${from}에서 접속했어요`,
      tone: 'warn',
    })
  } else {
    facts.push({
      label: '접속',
      text: `카드 발급국과 같은 나라에서 접속했어요 · ${where}`,
      tone: 'ok',
    })
  }
  if (ctx?.deviceLabel) {
    facts.push({ label: '기기', text: `${ctx.deviceLabel}에서 결제했어요`, tone: 'ok' })
  }
  const joined = ctx?.customerJoinedAt ? Date.parse(ctx.customerJoinedAt) : null
  const paid = ctx ? Date.parse(ctx.requestedAt) : null
  const age = joined !== null && paid !== null ? paid - joined : null
  if (hit.has('NEW_ACCOUNT')) {
    const after =
      age === null
        ? '하루 안'
        : age < HOUR
          ? `${Math.max(1, Math.round(age / MINUTE))}분`
          : `${Math.round(age / HOUR)}시간`
    facts.push({ label: '계정', text: `가입 ${after} 만에 결제했어요`, tone: 'warn' })
  } else if (age !== null) {
    facts.push({
      label: '계정',
      text: `가입한 지 ${Math.floor(age / DAY)}일 된 계정이에요`,
      tone: 'ok',
    })
  }
  const amount = ctx ? koreanWon(ctx.amount) : '이 금액'
  if (hit.has('AMOUNT_SPIKE')) {
    // 실제 배수는 평가 당시 값으로 (5배는 Rule이 걸리는 기준일 뿐)
    const observed = detail.ruleHits.find((h) => h.ruleCode === 'AMOUNT_SPIKE')?.observedValue
    facts.push({
      label: '금액',
      text: observed
        ? `${amount} · ${observed}예요 (기준 5배 이상)`
        : `${amount} · 이 고객 평소 결제의 5배가 넘어요`,
      tone: 'warn',
    })
  } else if (hit.has('HIGH_AMOUNT')) {
    facts.push({
      label: '금액',
      text: `${amount} · 50만 원이 넘는 고액이에요 (이 고객에겐 평소 수준)`,
      tone: 'warn',
    })
  } else {
    facts.push({ label: '금액', text: `${amount} · 평소와 비슷한 금액이에요`, tone: 'ok' })
  }
  if (hit.has('CARD_TESTING')) {
    facts.push({ label: '시도', text: '같은 접속에서 여러 카드를 번갈아 시도했어요', tone: 'bad' })
  }
  if (hit.has('DECLINE_RETRY')) {
    facts.push({ label: '시도', text: '카드사에서 거절된 뒤 다시 시도한 결제예요', tone: 'warn' })
  }
  return facts
}

export type BlockCandidate = {
  type: BlocklistType
  value: string
  // 화면에 보일 이름 (원문 값 대신)
  label: string
  // 이미 차단 목록에 있으면 true
  already: boolean
}

// 이메일은 앞 한 글자만 남긴다 (minsu.kim@example.com → m*******@example.com)
export function maskEmail(email: string): string {
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(1, name.length - 1))}@${domain}`
}

// 경보 상세에서 차단 목록에 올릴 수 있는 값. CARD 값은 마스킹 값만 주고받는다
export function blockCandidates(
  ctx: PaymentContext | null,
  blocklist: BlocklistEntry[],
): BlockCandidate[] {
  if (!ctx) return []
  const active = blocklist.filter((b) => b.releasedAt === null)
  const has = (type: BlocklistType, value: string) =>
    active.some((b) => b.entryType === type && b.entryValue === value)
  const rows: Omit<BlockCandidate, 'already'>[] = []
  if (ctx.cardLast4) {
    rows.push({ type: 'CARD', value: `**** ${ctx.cardLast4}`, label: cardName(ctx.cardLast4) })
  }
  if (ctx.deviceId) {
    rows.push({
      type: 'DEVICE',
      value: ctx.deviceId,
      label: `기기 · ${ctx.deviceLabel ?? '설명 없음'}`,
    })
  }
  if (ctx.clientIp) {
    rows.push({
      type: 'IP',
      value: ctx.clientIp,
      label: `접속 위치 · ${ctx.ip ? placeName(ctx.ip.label) : '확인되지 않은 접속 위치'}`,
    })
  }
  if (ctx.buyerEmail) {
    rows.push({
      type: 'EMAIL',
      value: ctx.buyerEmail,
      label: `이메일 · ${maskEmail(ctx.buyerEmail)}`,
    })
  }
  return rows.map((r) => ({ ...r, already: has(r.type, r.value) }))
}

// entry_id → 승인을 기다리는 해제 요청
export function pendingReleases(approvals: ApprovalRequest[]): Map<number, ApprovalRequest> {
  const result = new Map<number, ApprovalRequest>()
  for (const a of approvals) {
    if (
      a.status === 'PENDING' &&
      a.requestType === 'BLOCKLIST_RELEASE' &&
      a.targetType === 'BLOCKLIST_ENTRY'
    )
      result.set(a.targetId, a)
  }
  return result
}

// 차단 목록 값의 화면 이름. IP · 기기는 사람이 읽을 이름이 없어 null (원본 보기 안에서만 보여 준다)
export function blocklistValueLabel(
  entry: Pick<BlocklistEntry, 'entryType' | 'entryValue'>,
): string | null {
  if (entry.entryType === 'CARD') return cardName(entry.entryValue.replace(/\D/g, '').slice(-4))
  if (entry.entryType === 'EMAIL') return maskEmail(entry.entryValue)
  return null
}
