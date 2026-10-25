// P3 결제 사건 Mock — 시나리오 ① 김민수 결제 사기(사건 201)와 지난 사건 180 · 175
// 결제 · 경보 · 보고서 번호는 api/mock/payment.ts · fdsEvaluations.ts · report.ts와 같다
// 테스트가 직접 불러오므로 import.meta.env를 읽는 mockMode는 쓰지 않는다
import { CaseVersionConflictError } from '../caseErrors.ts'
import { mockRespond } from './respond.ts'
import type {
  ActionHandoff,
  CaseDetail,
  CaseHistory,
  CasePayment,
  CaseSummary,
  PaymentDecision,
  SubmitDecisionsRequest,
} from '../../types/case.ts'
import type { RuleCode } from '../../types/fds.ts'

const DAY = 24 * 60
const minutesAgo = (now: Date, minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString()

function payment(
  now: Date,
  casePaymentId: string,
  paymentId: string,
  minutes: number,
  amount: number,
  paymentStatus: CasePayment['paymentStatus'],
  riskScore: number,
  evaluationId: number | null,
  hitRuleCodes: RuleCode[],
): CasePayment {
  return {
    casePaymentId,
    paymentId,
    linkedAt: minutesAgo(now, minutes - 1),
    amount,
    paymentStatus,
    requestedAt: minutesAgo(now, minutes),
    riskScore,
    fdsResult: 'REVIEW',
    ruleHits: hitRuleCodes,
    evaluationId,
    hitRuleCodes,
  }
}

function history(
  now: Date,
  caseId: string,
  rows: [CaseHistory['eventType'], number, Record<string, string>?][],
): CaseHistory[] {
  return rows.map(([eventType, minutes, eventData], i) => ({
    historyId: `${caseId}-${i + 1}`,
    caseId,
    eventType,
    actorType: eventType === 'DECISION_CONFIRMED' ? 'STAFF' : 'SYSTEM',
    actorId: eventType === 'DECISION_CONFIRMED' ? '4' : null,
    eventData: eventData ?? {},
    createdAt: minutesAgo(now, minutes),
  }))
}

// 끝난 사건의 판정 · 조치 인계 한 건
function decided(
  now: Date,
  caseId: string,
  casePaymentId: string,
  decision: PaymentDecision['decision'],
  reason: string,
  minutes: number,
): { decision: PaymentDecision; handoff: ActionHandoff } {
  const decisionId = `${casePaymentId}-D`
  return {
    decision: {
      decisionId,
      casePaymentId,
      staffId: '4',
      reportId: `R${caseId}`,
      decision,
      reason,
      decidedAt: minutesAgo(now, minutes),
    },
    handoff: {
      handoffId: `${casePaymentId}-H`,
      decisionId,
      actionType: decision === 'ACCEPT' ? 'CAPTURE' : 'VOID',
      status: 'ACCEPTED',
      targetOperationId: null,
      requestedAt: minutesAgo(now, minutes),
      acceptedAt: minutesAgo(now, minutes - 1),
      lastErrorCode: null,
    },
  }
}

const report = (now: Date, caseId: string, created: number, done: number) => ({
  reportId: `R${caseId}`,
  caseId,
  reportVersion: 1,
  evidenceVersion: 1,
  status: 'SUCCEEDED' as const,
  // 보고서 본문은 결론 카드 계약(api/report.ts)으로 따로 가져온다
  reportBody: null,
  createdAt: minutesAgo(now, created),
  completedAt: minutesAgo(now, done),
})

export function buildMockCases(now: Date): CaseDetail[] {
  const old180 = decided(now, '180', '1801', 'REJECT', '카드 명의자 도용 신고 확인', 40 * DAY - 60)
  const old175 = decided(now, '175', '1751', 'ACCEPT', '고객 통화로 본인 결제 확인', 55 * DAY - 90)
  return [
    {
      securityCase: {
        caseId: '201',
        merchantId: '1',
        customerRef: 'C-0142',
        caseType: 'PAYMENT_FRAUD',
        status: 'DECISION_PENDING',
        evidenceVersion: 1,
        createdAt: minutesAgo(now, 24),
        closedAt: null,
        subjectLabel: '김민수 고객',
        groupingBasis: '같은 고객 · 30분 창',
      },
      payments: [
        payment(now, '2011', '31', 25, 650000, 'HELD', 55, 103, [
          'HIGH_AMOUNT',
          'AMOUNT_SPIKE',
          'NEW_CARD',
        ]),
      ],
      reports: [report(now, '201', 24, 20)],
      decisions: [],
      handoffs: [],
      history: history(now, '201', [
        ['CASE_CREATED', 24],
        ['PAYMENT_LINKED', 24, { paymentId: '31' }],
        ['CASE_STATUS_CHANGED', 20, { to: 'DECISION_PENDING' }],
      ]),
    },
    {
      securityCase: {
        caseId: '180',
        merchantId: '1',
        customerRef: 'C-0142',
        caseType: 'PAYMENT_FRAUD',
        status: 'CLOSED',
        evidenceVersion: 1,
        createdAt: minutesAgo(now, 40 * DAY + 10),
        closedAt: minutesAgo(now, 40 * DAY - 61),
        subjectLabel: '김민수 고객',
        groupingBasis: '같은 고객 · 30분 창',
      },
      payments: [
        payment(now, '1801', '18', 40 * DAY + 11, 480000, 'VOIDED', 70, null, [
          'HIGH_AMOUNT',
          'NEW_CARD',
          'AMOUNT_SPIKE',
        ]),
      ],
      reports: [report(now, '180', 40 * DAY + 10, 40 * DAY)],
      decisions: [old180.decision],
      handoffs: [old180.handoff],
      history: history(now, '180', [
        ['CASE_CREATED', 40 * DAY + 10],
        ['PAYMENT_LINKED', 40 * DAY + 10, { paymentId: '18' }],
        ['DECISION_CONFIRMED', 40 * DAY - 60],
        ['HANDOFF_ACCEPTED', 40 * DAY - 61],
        ['CASE_CLOSED', 40 * DAY - 61],
      ]),
    },
    {
      securityCase: {
        caseId: '175',
        merchantId: '1',
        customerRef: 'C-0066',
        caseType: 'PAYMENT_FRAUD',
        status: 'CLOSED',
        evidenceVersion: 1,
        createdAt: minutesAgo(now, 55 * DAY + 10),
        closedAt: minutesAgo(now, 55 * DAY - 91),
        subjectLabel: '한도윤 고객',
        groupingBasis: '같은 고객 · 30분 창',
      },
      payments: [
        payment(now, '1751', '17', 55 * DAY + 11, 520000, 'CAPTURED', 50, null, [
          'HIGH_AMOUNT',
          'NEW_CARD',
        ]),
      ],
      reports: [report(now, '175', 55 * DAY + 10, 55 * DAY)],
      decisions: [old175.decision],
      handoffs: [old175.handoff],
      history: history(now, '175', [
        ['CASE_CREATED', 55 * DAY + 10],
        ['PAYMENT_LINKED', 55 * DAY + 10, { paymentId: '17' }],
        ['DECISION_CONFIRMED', 55 * DAY - 90],
        ['HANDOFF_ACCEPTED', 55 * DAY - 91],
        ['CASE_CLOSED', 55 * DAY - 91],
      ]),
    },
  ]
}

// 화면에서 판정한 내용은 새로고침 전까지만 남는다
let store: CaseDetail[] | null = null
const current = () => (store ??= buildMockCases(new Date()))

export function resetMockCases() {
  store = null
}

export function toSummary(d: CaseDetail): CaseSummary {
  const amounts = d.payments.map((p) => p.amount)
  const latest = d.reports.reduce<CaseDetail['reports'][number] | null>(
    (a, r) => (!a || r.reportVersion > a.reportVersion ? r : a),
    null,
  )
  return {
    ...d.securityCase,
    paymentCount: d.payments.length,
    totalAmount: amounts.some((a) => a === null)
      ? null
      : amounts.reduce<number>((s, a) => s + (a ?? 0), 0),
    maxRiskScore: Math.max(...d.payments.map((p) => p.riskScore ?? 0)),
    latestReportStatus: latest?.status ?? null,
    decidedCount: d.decisions.length,
    hitRuleCodes: [...new Set(d.payments.flatMap((p) => p.hitRuleCodes))],
  }
}

export function mockGetCases(): Promise<CaseSummary[]> {
  return mockRespond(current().map(toSummary))
}

export function mockGetCase(caseId: string): Promise<CaseDetail | null> {
  return mockRespond(current().find((d) => d.securityCase.caseId === caseId) ?? null)
}

// 판정 확정 → 결제별 조치 인계(매입 · 승인 취소)는 바로 접수된 것으로 둔다. 모두 판정되면 종료
export async function mockSubmitDecisions(
  caseId: string,
  staffId: number,
  request: SubmitDecisionsRequest,
): Promise<void> {
  await mockRespond(null)
  const found = current().find((d) => d.securityCase.caseId === caseId)
  if (!found) throw new Error(`사건 ${caseId}을 찾을 수 없습니다.`)
  if (found.securityCase.evidenceVersion !== request.evidenceVersion) {
    throw new CaseVersionConflictError()
  }
  const now = new Date().toISOString()
  let seq = found.decisions.length
  for (const d of request.decisions) {
    if (found.decisions.some((x) => x.casePaymentId === d.casePaymentId)) continue
    const decisionId = `${d.casePaymentId}-D${++seq}`
    found.decisions.push({
      decisionId,
      casePaymentId: d.casePaymentId,
      staffId: String(staffId),
      reportId: request.reportId,
      decision: d.decision,
      reason: d.reason,
      decidedAt: now,
    })
    found.handoffs.push({
      handoffId: `${decisionId}-H`,
      decisionId,
      actionType: d.decision === 'ACCEPT' ? 'CAPTURE' : 'VOID',
      status: 'ACCEPTED',
      targetOperationId: null,
      requestedAt: now,
      acceptedAt: now,
      lastErrorCode: null,
    })
    const p = found.payments.find((x) => x.casePaymentId === d.casePaymentId)
    if (p) p.paymentStatus = d.decision === 'ACCEPT' ? 'CAPTURED' : 'VOIDED'
  }
  const add = (eventType: CaseHistory['eventType'], actor: 'STAFF' | 'SYSTEM') =>
    found.history.push({
      historyId: `${caseId}-${found.history.length + 1}`,
      caseId,
      eventType,
      actorType: actor,
      actorId: actor === 'STAFF' ? String(staffId) : null,
      eventData: {},
      createdAt: now,
    })
  add('DECISION_CONFIRMED', 'STAFF')
  add('HANDOFF_ACCEPTED', 'SYSTEM')
  if (found.decisions.length === found.payments.length) {
    found.securityCase.status = 'CLOSED'
    found.securityCase.closedAt = now
    add('CASE_CLOSED', 'SYSTEM')
  }
}
