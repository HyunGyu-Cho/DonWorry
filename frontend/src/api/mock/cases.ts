// P3 결제 사건 Mock — 시나리오 ① 김민수 결제 사기(사건 201)와 지난 사건 180 · 175
// 결제 · 경보 · 보고서 번호는 api/mock/payment.ts · fdsEvaluations.ts · report.ts와 같다
// 테스트가 직접 불러오므로 import.meta.env를 읽는 mockMode는 쓰지 않는다
import { CaseVersionConflictError, ReauthRequiredError } from '../caseErrors.ts'
import { mockConsumeReauth } from './identity.ts'
import { mockAudit, mockCreateApproval, mockOverrideApprovals } from './investigation.ts'
import { buildMockPayments } from './payment.ts'
import { buildMockReports } from './report.ts'
import { mockRespond } from './respond.ts'
import type {
  ActionHandoff,
  CaseDetail,
  CaseHistory,
  CasePayment,
  CaseSummary,
  HandoffRow,
  PaymentDecision,
  SubmitDecisionsRequest,
  SubmitDecisionsResult,
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
const current = () => syncOverrides((store ??= buildMockCases(new Date())))

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

type Decided = SubmitDecisionsRequest['decisions']

function addHistory(
  found: CaseDetail,
  eventType: CaseHistory['eventType'],
  actorId: number | null,
  at: string,
  eventData: Record<string, string> = {},
) {
  const caseId = found.securityCase.caseId
  found.history.push({
    historyId: `${caseId}-${found.history.length + 1}`,
    caseId,
    eventType,
    actorType: actorId === null ? 'SYSTEM' : 'STAFF',
    actorId: actorId === null ? null : String(actorId),
    eventData,
    createdAt: at,
  })
}

// 판정 반영 → 결제별 조치 인계(매입 · 승인 취소)는 바로 접수된 것으로 둔다. 모두 판정되면 종료
function applyDecisions(
  found: CaseDetail,
  staffId: number,
  decisions: Decided,
  reportId: string | null,
  at: string,
) {
  let seq = found.decisions.length
  for (const d of decisions) {
    if (found.decisions.some((x) => x.casePaymentId === d.casePaymentId)) continue
    const decisionId = `${d.casePaymentId}-D${++seq}`
    found.decisions.push({
      decisionId,
      casePaymentId: d.casePaymentId,
      staffId: String(staffId),
      reportId,
      decision: d.decision,
      reason: d.reason,
      decidedAt: at,
    })
    found.handoffs.push({
      handoffId: `${decisionId}-H`,
      decisionId,
      actionType: d.decision === 'ACCEPT' ? 'CAPTURE' : 'VOID',
      status: 'ACCEPTED',
      targetOperationId: null,
      requestedAt: at,
      acceptedAt: at,
      lastErrorCode: null,
    })
    const p = found.payments.find((x) => x.casePaymentId === d.casePaymentId)
    if (p) p.paymentStatus = d.decision === 'ACCEPT' ? 'CAPTURED' : 'VOIDED'
  }
  addHistory(found, 'DECISION_CONFIRMED', staffId, at)
  addHistory(found, 'HANDOFF_ACCEPTED', null, at)
  if (found.decisions.length === found.payments.length) {
    found.securityCase.status = 'CLOSED'
    found.securityCase.closedAt = at
    addHistory(found, 'CASE_CLOSED', null, at)
  } else {
    found.securityCase.status = 'DECISION_PENDING'
  }
}

// 관리자 승인을 기다리던 판정: 승인되면 반영, 거절되면 판정 대기로 (Rule 끄기와 같이 읽을 때 반영)
function syncOverrides(cases: CaseDetail[]): CaseDetail[] {
  for (const found of cases) {
    if (found.securityCase.status !== 'APPROVAL_PENDING') continue
    const req = mockOverrideApprovals().find(
      (a) => a.payload?.caseId === found.securityCase.caseId && a.status !== 'PENDING',
    )
    if (!req || !req.decidedAt) continue
    if (req.status === 'APPROVED') {
      addHistory(found, 'CASE_STATUS_CHANGED', req.decidedBy, req.decidedAt, {
        to: 'APPROVED',
        comment: req.decisionComment ?? '',
      })
      applyDecisions(
        found,
        req.requestedBy,
        (req.payload?.decisions ?? []) as Decided,
        (req.payload?.reportId ?? null) as string | null,
        req.decidedAt,
      )
    } else {
      found.securityCase.status = 'DECISION_PENDING'
      addHistory(found, 'CASE_STATUS_CHANGED', req.decidedBy, req.decidedAt, {
        to: 'REJECTED',
        comment: req.decisionComment ?? '',
      })
    }
  }
  return cases
}

// AI 권고가 "승인 취소 검토"인데 매입 허용을 고른 결제 (권고 반대 판단은 서버 몫 — 화면 표시는 참고)
function oppositeDecisions(caseId: string, decisions: Decided): Decided {
  const report = buildMockReports(new Date()).find((r) => r.caseId === caseId)
  const recs = report?.paymentRecommendations ?? []
  return decisions.filter((d) => {
    const payment = current()
      .find((c) => c.securityCase.caseId === caseId)
      ?.payments.find((p) => p.casePaymentId === d.casePaymentId)
    const rec = recs.find((r) => r.paymentId === payment?.paymentId)?.recommendation
    return d.decision === 'ACCEPT' && rec === 'REJECT_REVIEW'
  })
}

// 판정 확정. 권고 반대가 섞이면 재인증 표를 확인하고 묶음 전체를 관리자 승인 대기로
export async function mockSubmitDecisions(
  caseId: string,
  staffId: number,
  request: SubmitDecisionsRequest,
): Promise<SubmitDecisionsResult> {
  await mockRespond(null)
  const found = current().find((d) => d.securityCase.caseId === caseId)
  if (!found) throw new Error(`사건 ${caseId}을 찾을 수 없습니다.`)
  if (found.securityCase.evidenceVersion !== request.evidenceVersion) {
    throw new CaseVersionConflictError()
  }
  const now = new Date().toISOString()
  const opposite = oppositeDecisions(caseId, request.decisions)
  if (opposite.length === 0) {
    applyDecisions(found, staffId, request.decisions, request.reportId, now)
    mockAudit('DECISION_CONFIRMED', ['SECURITY_CASE', Number(caseId)], {
      decisions: request.decisions.map((d) => d.decision),
    })
    return { outcome: 'DECIDED', approvalId: null }
  }
  if (!mockConsumeReauth(request.reauthToken, staffId)) throw new ReauthRequiredError()
  const titles = buildMockPayments(new Date())
  const first = found.payments.find((p) => p.casePaymentId === opposite[0].casePaymentId)
  const title = titles.find((t) => t.paymentId === first?.paymentId)?.orderTitle ?? '결제'
  const approval = await mockCreateApproval({
    requestType: 'DECISION_OVERRIDE',
    targetType: 'PAYMENT_DECISION',
    targetId: Number(opposite[0].casePaymentId),
    targetLabel: `${found.securityCase.subjectLabel} · ${title} 매입 허용 (AI 권고 "취소 검토"와 반대)`,
    payload: {
      caseId,
      decisions: request.decisions,
      evidenceVersion: request.evidenceVersion,
      reportId: request.reportId,
      reauthenticated: true,
    },
    reason: opposite.map((d) => d.reason).join(' / '),
  })
  found.securityCase.status = 'APPROVAL_PENDING'
  addHistory(found, 'CASE_STATUS_CHANGED', staffId, now, { to: 'APPROVAL_PENDING' })
  return { outcome: 'APPROVAL_PENDING', approvalId: approval.approvalId }
}

// 조치 센터: 모든 결제 사건의 조치 인계를 최신순으로
export function mockGetHandoffs(): Promise<HandoffRow[]> {
  const payments = buildMockPayments(new Date())
  const rows: HandoffRow[] = []
  for (const d of current()) {
    for (const h of d.handoffs) {
      const decision = d.decisions.find((x) => x.decisionId === h.decisionId)
      const p = d.payments.find((x) => x.casePaymentId === decision?.casePaymentId)
      rows.push({
        ...h,
        caseId: d.securityCase.caseId,
        subjectLabel: d.securityCase.subjectLabel,
        paymentId: p?.paymentId ?? '',
        paymentTitle: payments.find((x) => x.paymentId === p?.paymentId)?.orderTitle ?? null,
        amount: p?.amount ?? null,
        paymentStatus: p?.paymentStatus ?? null,
      })
    }
  }
  return mockRespond(rows.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)))
}
