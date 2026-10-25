import { ArrowLeftOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Input, Radio, Result, Spin, Table, Tag } from 'antd'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  CaseVersionConflictError,
  getCase,
  ReauthRequiredError,
  submitDecisions,
} from '../../api/cases'
import { getRules, getStaffAlerts } from '../../api/fdsRules'
import { getLoginEvents, getStaffAccounts, getStaffSessions } from '../../api/identity'
import { getApprovals, getStaffCase, requestCaseActions } from '../../api/investigation'
import { CaseActionForbiddenError, StaffCaseForbiddenError } from '../../api/investigationErrors'
import { getPaymentContext } from '../../api/payment'
import { getCaseReport, getReportRun } from '../../api/report'
import { useAuth } from '../../auth/useAuth'
import { useFeedback } from '../../components/common/Feedback'
import { PageHeader } from '../../components/common/PageHeader'
import { RawDetails } from '../../components/explain/RawDetails'
import { useDemo } from '../../demo/DemoContext'
import type { CaseDetail } from '../../types/case'
import type { StaffAccount, StaffLoginEvent, StaffSession } from '../../types/auth'
import type { FdsRule, RuleCode, StaffAlert } from '../../types/fds'
import type { ApprovalRequest, StaffCase } from '../../types/investigation'
import type { PaymentContext } from '../../types/payment'
import type { ConclusionReport, ReportRun } from '../../types/report'
import { decisionMode } from '../../utils/caseRules'
import {
  ACTION_LABEL,
  historyText,
  paymentFlowCards,
  staffFlowCards,
  staffVerdicts,
  type StaffVerdict,
} from '../../utils/caseView'
import { cardName, koreanWon, relativeTime } from '../../utils/humanize'
import { distributedAttack, suspiciousSessionIds } from '../../utils/staffAccess'
import { DecisionPanel } from './case/DecisionPanel'
import { DEMO_CHANGED } from '../../components/tutorial/tutorialStore'
import {
  AiSummaryCard,
  CaseFlow,
  CaseHistoryCard,
  CaseStatusStrip,
  type HistoryRow,
} from './case/CaseParts'
import { caseTypeLabel, paymentStatusLabel } from './case/caseLabels'

type Common = { rules: FdsRule[]; report: ConclusionReport | null; run: ReportRun | null }
type PaymentData = Common & {
  kind: 'payment'
  detail: CaseDetail
  contexts: PaymentContext[]
  // 이 사건의 권고 반대 판정 승인 요청 (최신 먼저)
  overrides: ApprovalRequest[]
}
type StaffData = Common & {
  kind: 'staff'
  staffCase: StaffCase
  alerts: StaffAlert[]
  accounts: StaffAccount[]
  sessions: StaffSession[]
  events: StaffLoginEvent[]
}
type Loaded = PaymentData | StaffData | 'missing' | 'forbidden' | 'error'

// 보고서 · 조사 진행 상태 (보고서가 없거나 권한이 없으면 null)
async function fetchReport(caseId: string) {
  const [report, run] = await Promise.all([
    getCaseReport(caseId).catch(() => null),
    getReportRun(caseId).catch(() => null),
  ])
  return { report, run }
}

// 결제 사건을 먼저 찾고, 없으면 직원 사건 (직원 사건은 보안 관리자만)
async function fetchCase(id: string, merchant: string): Promise<Loaded> {
  try {
    const rules = await getRules()
    const detail = await getCase(id, merchant)
    if (detail) {
      const [contexts, rep, approvals] = await Promise.all([
        Promise.all(detail.payments.map((p) => getPaymentContext(p.paymentId))),
        fetchReport(id),
        getApprovals().catch(() => []),
      ])
      return {
        kind: 'payment',
        detail,
        contexts: contexts.filter((c): c is PaymentContext => c !== null),
        overrides: approvals
          .filter((a) => a.requestType === 'DECISION_OVERRIDE' && a.payload?.caseId === id)
          .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
        rules,
        ...rep,
      }
    }
    const staffCase = await getStaffCase(id)
    if (!staffCase) return 'missing'
    const [alerts, accounts, sessions, events, rep] = await Promise.all([
      getStaffAlerts(),
      getStaffAccounts(),
      getStaffSessions(false),
      getLoginEvents(),
      fetchReport(id),
    ])
    return { kind: 'staff', staffCase, alerts, accounts, sessions, events, rules, ...rep }
  } catch (e) {
    return e instanceof StaffCaseForbiddenError ? 'forbidden' : 'error'
  }
}

function PaymentTargets(props: { data: PaymentData }) {
  const { detail, contexts } = props.data
  const ctxOf = (id: string) => contexts.find((c) => c.paymentId === id)
  return (
    <Card title="조사 대상 결제">
      <Table
        rowKey="casePaymentId"
        size="small"
        pagination={false}
        dataSource={detail.payments}
        columns={[
          {
            title: '상품',
            key: 'title',
            render: (_, p) => <b>{ctxOf(p.paymentId)?.orderTitle ?? '상품 정보 없음'}</b>,
          },
          {
            title: '금액',
            key: 'amount',
            align: 'right',
            render: (_, p) => (p.amount === null ? '—' : koreanWon(p.amount)),
          },
          {
            title: '카드',
            key: 'card',
            render: (_, p) => cardName(ctxOf(p.paymentId)?.cardLast4 ?? null),
          },
          { title: '점수', dataIndex: 'riskScore', align: 'right', render: (v) => v ?? '—' },
          {
            title: '결제 상태',
            key: 'status',
            render: (_, p) =>
              p.paymentStatus ? (
                <Tag color={paymentStatusLabel[p.paymentStatus].color}>
                  {paymentStatusLabel[p.paymentStatus].label}
                </Tag>
              ) : (
                '—'
              ),
          },
        ]}
      />
    </Card>
  )
}

function StaffTargets({ data, now }: { data: StaffData; now: Date }) {
  const { staffCase, accounts, sessions, events } = data
  if (staffCase.caseType === 'STAFF_SPRAY') {
    const attack = distributedAttack(events, now, 60)
    const successes = events.filter(
      (e) =>
        e.result === 'SUCCESS' && e.ip.ipType !== 'OFFICE' && e.occurredAt >= staffCase.createdAt,
    ).length
    return (
      <Card title="공격 현황">
        <dl className="dw-rule-rows">
          <dt>공격 IP</dt>
          <dd>
            {attack ? `${attack.ips.length}개 · 해외 대역` : '집계 중'} (IP 하나당 실패 몇 번이라
            IP별 기준에 안 걸림)
          </dd>
          <dt>대상 계정</dt>
          <dd>{staffCase.subjectLabel}</dd>
          <dt>로그인 성공</dt>
          <dd>
            <b>{successes}건</b> {successes === 0 && '(OTP 단계까지 간 시도 없음)'}
          </dd>
        </dl>
      </Card>
    )
  }
  const suspicious = suspiciousSessionIds(sessions)
  return (
    <Card title="대상 계정 현재 상태">
      {staffCase.subjectUserIds.map((userId) => {
        const account = accounts.find((a) => a.userId === userId)
        const mine = sessions.filter((s) => s.userId === userId && s.endedAt === null)
        return (
          <dl key={userId} className="dw-rule-rows">
            <dt>계정</dt>
            <dd>
              {account?.displayName ?? '알 수 없는 직원'}{' '}
              <Tag color={account?.locked ? 'red' : 'green'}>
                {account?.locked ? '잠김' : '사용 중'}
              </Tag>
            </dd>
            <dt>세션</dt>
            <dd>
              진행 중 {mine.length}개
              {mine.some((s) => suspicious.has(s.staffSessionId)) && (
                <Tag color="red" style={{ marginLeft: 6 }}>
                  탈취 의심 세션 있음
                </Tag>
              )}
            </dd>
          </dl>
        )
      })}
    </Card>
  )
}

// 권고 반대 판정이 관리자 승인을 기다리는 동안 판정 칸 대신 보인다
function OverridePendingCard(props: { approval: ApprovalRequest; manager: boolean; now: Date }) {
  const { approval, manager, now } = props
  return (
    <Card title="관리자 승인 대기" extra={<Tag color="purple">승인 대기</Tag>}>
      <div className="dw-case-decision">
        <Alert
          type="warning"
          showIcon
          message="AI 권고와 반대로 매입 허용을 요청했어요"
          description="보안 관리자가 승인하면 판정이 반영되고 매입이 진행돼요. 직원 계정이 털려도 혼자서는 의심 결제를 통과시킬 수 없게 하는 장치예요."
        />
        <dl className="dw-rule-rows">
          <dt>요청</dt>
          <dd>
            {approval.requestedByName} · {relativeTime(approval.requestedAt, now)} ·{' '}
            {approval.payload?.reauthenticated ? 'OTP 재인증 완료' : '재인증 정보 없음'}
          </dd>
          <dt>사유</dt>
          <dd>{approval.reason}</dd>
          <dt>대상</dt>
          <dd>{approval.targetLabel}</dd>
        </dl>
        {manager && (
          <Link to="/manager/approvals">
            <Button type="primary">관리자 승인함에서 처리</Button>
          </Link>
        )}
        <RawDetails title="원본 값" rows={[['승인 요청 번호', approval.approvalId]]} />
      </div>
    </Card>
  )
}

// 직원 사건 판정 (보안 관리자) — 판정을 고르면 조치 묶음을 요청한다
function StaffDecision(props: { staffCase: StaffCase; locked: boolean; onDone: () => void }) {
  const { staffCase, locked, onDone } = props
  const { toast, confirmDanger } = useFeedback()
  const [pick, setPick] = useState<StaffVerdict | null>(null)
  const [reason, setReason] = useState('')
  const verdicts = staffVerdicts(staffCase.caseType)

  if (staffCase.status === 'CLOSED') {
    return (
      <Card title="판정 결과">
        {staffCase.actions.length === 0 ? (
          <p className="dw-muted">기록된 조치가 없습니다.</p>
        ) : (
          staffCase.actions.map((a) => (
            <div key={a.caseActionId} className="dw-case-hist">
              <Tag color={a.status === 'DONE' ? 'green' : a.status === 'FAILED' ? 'red' : 'blue'}>
                {a.status === 'DONE' ? '완료' : a.status === 'FAILED' ? '실패' : '요청'}
              </Tag>
              <span>{ACTION_LABEL[a.actionType]}</span>
            </div>
          ))
        )}
      </Card>
    )
  }

  const submit = () =>
    pick &&
    confirmDanger({
      title: `"${pick.title}"(으)로 판정할까요?`,
      content: `다음 조치를 바로 요청합니다: ${pick.actions.map((a) => ACTION_LABEL[a]).join(' · ')}`,
      onConfirm: async () => {
        try {
          await requestCaseActions(
            staffCase.caseId,
            pick.actions.map((actionType) => ({ actionType })),
            reason.trim(),
          )
          void toast.success('판정했습니다. 조치가 요청됐어요.')
          onDone()
        } catch (e) {
          void toast.error(
            e instanceof CaseActionForbiddenError ? e.message : '판정하지 못했습니다.',
          )
        }
      },
    })

  return (
    <Card title="관리자 판정">
      <div className="dw-case-decision">
        {locked && <Alert type="info" showIcon message="AI 보고서가 나오면 판정할 수 있습니다." />}
        <Radio.Group
          disabled={locked}
          value={pick?.key}
          onChange={(e) => setPick(verdicts.find((v) => v.key === e.target.value) ?? null)}
          className="dw-case-verdicts"
        >
          {verdicts.map((v) => (
            <Radio key={v.key} value={v.key}>
              <b>{v.title}</b>
              <div className="dw-muted dw-small">
                {v.actions.map((a) => ACTION_LABEL[a]).join(' · ')}
              </div>
            </Radio>
          ))}
        </Radio.Group>
        <Input.TextArea
          disabled={locked}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="판정 사유 (필수) — 감사 로그에 남습니다"
          autoSize={{ minRows: 2, maxRows: 4 }}
          maxLength={300}
        />
        <div className="dw-case-decision-foot">
          <span className="dw-muted dw-small">대상 직원 본인은 판정할 수 없습니다 (직무 분리)</span>
          <Button
            type="primary"
            danger={pick?.danger}
            disabled={locked || !pick || !reason.trim()}
            onClick={submit}
          >
            판정 확정
          </Button>
        </div>
      </div>
    </Card>
  )
}

export function CaseDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { merchant } = useDemo()
  const { user } = useAuth()
  const { toast } = useFeedback()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [now, setNow] = useState(() => new Date())
  const manager = user?.role === 'SECURITY_MANAGER'
  const base = manager ? '/manager/cases' : '/security/cases'

  const apply = useCallback((result: Loaded) => {
    setNow(new Date())
    setLoaded(result)
  }, [])
  const load = useCallback(() => fetchCase(id, merchant).then(apply), [id, merchant, apply])

  useEffect(() => {
    let alive = true
    void fetchCase(id, merchant).then((result) => {
      if (alive) apply(result)
    })
    // 튜토리얼 시연 버튼으로 데이터가 바뀌면 다시 읽는다
    const reload = () => void fetchCase(id, merchant).then((result) => alive && apply(result))
    window.addEventListener(DEMO_CHANGED, reload)
    return () => {
      alive = false
      window.removeEventListener(DEMO_CHANGED, reload)
    }
  }, [id, merchant, apply])

  // 조사 중이면 1초마다 진행 상태를 다시 본다. 끝나면 보고서까지 다시 불러온다
  const running = typeof loaded === 'object' && loaded?.run?.status === 'RUNNING'
  useEffect(() => {
    if (!running) return
    const timer = setTimeout(() => {
      void fetchReport(id).then((rep) => {
        setNow(new Date())
        setLoaded((prev) => (prev && typeof prev === 'object' ? { ...prev, ...rep } : prev))
        // 조사가 끝나면 알리고, [AI 보고서] 버튼이 생긴다 (보고서 화면으로 자동 이동은 안 함)
        if (rep.run?.status === 'SUCCEEDED') {
          void toast.success(
            'AI 조사가 끝났어요. 결론을 보고 [AI 보고서]에서 자세히 읽을 수 있어요.',
          )
        }
      })
    }, 1000)
    return () => clearTimeout(timer)
  }, [running, loaded, id, toast])

  const rules = useMemo(() => (typeof loaded === 'object' && loaded ? loaded.rules : []), [loaded])
  const ruleName = useCallback(
    (code: RuleCode) => rules.find((r) => r.ruleCode === code)?.displayName ?? code,
    [rules],
  )
  const cards = useMemo(() => {
    if (!loaded || typeof loaded !== 'object') return []
    return loaded.kind === 'payment'
      ? paymentFlowCards(loaded.detail, ruleName, !manager)
      : staffFlowCards(loaded.staffCase, loaded.alerts, ruleName)
  }, [loaded, ruleName, manager])

  const back = (
    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(base)}>
      목록
    </Button>
  )
  if (loaded === null) {
    return (
      <>
        <PageHeader title="사건" actions={back} />
        <div className="dw-error-view" role="status">
          <Spin size="large" />
        </div>
      </>
    )
  }
  if (loaded === 'forbidden') {
    return (
      <Result
        status="403"
        title="보안 관리자만 볼 수 있어요"
        subTitle="직원 계정 사건은 대상 직원이 자기 사건을 판정하지 못하도록 보안 관리자만 엽니다 (직무 분리)."
        extra={back}
      />
    )
  }
  if (loaded === 'missing' || loaded === 'error') {
    return (
      <>
        <PageHeader title="사건" actions={back} />
        <Alert
          type="warning"
          showIcon
          message={loaded === 'missing' ? '찾는 사건이 없습니다.' : '사건을 불러오지 못했습니다.'}
          action={loaded === 'error' && <Button onClick={() => void load()}>다시 시도</Button>}
        />
      </>
    )
  }

  const { report, run } = loaded
  const sc =
    loaded.kind === 'payment'
      ? {
          caseId: loaded.detail.securityCase.caseId,
          caseType: loaded.detail.securityCase.caseType,
          status: loaded.detail.securityCase.status,
          subjectLabel: loaded.detail.securityCase.subjectLabel,
          groupingBasis: loaded.detail.securityCase.groupingBasis,
          createdAt: loaded.detail.securityCase.createdAt,
        }
      : loaded.staffCase
  const aiRunning = run?.status === 'RUNNING'

  let right: ReactNode
  let history: HistoryRow[]
  if (loaded.kind === 'payment') {
    const { detail, contexts } = loaded
    const titleOf = (paymentId: string) =>
      contexts.find((c) => c.paymentId === paymentId)?.orderTitle ?? '상품 정보 없음'
    const mode = aiRunning
      ? ({ kind: 'blocked', message: 'AI 조사가 끝나면 판정할 수 있습니다.' } as const)
      : decisionMode(detail.securityCase.evidenceVersion, detail.reports)
    const pending = loaded.overrides.find((a) => a.status === 'PENDING')
    const rejected =
      detail.securityCase.status === 'DECISION_PENDING'
        ? loaded.overrides.find((a) => a.status === 'REJECTED')
        : undefined
    right =
      detail.securityCase.status === 'APPROVAL_PENDING' && pending ? (
        <OverridePendingCard approval={pending} manager={manager} now={now} />
      ) : manager ? (
        <Card>
          <b>보안 직원이 판정합니다</b>
          <p className="dw-muted dw-small">
            관리자는 AI 권고와 반대되는 판정이 올라오면 관리자 승인함에서 승인합니다.
          </p>
        </Card>
      ) : (
        <>
          {rejected && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="관리자가 권고 반대 판정을 거절했어요"
              description={`${rejected.decisionComment ?? '이유 없음'} — 다시 확인하고 판정해 주세요.`}
            />
          )}
          <DecisionPanel
            payments={detail.payments}
            titleOf={titleOf}
            decisions={detail.decisions}
            recommendations={report?.paymentRecommendations ?? []}
            mode={mode}
            evidenceVersion={detail.securityCase.evidenceVersion}
            onSubmit={async (request) => {
              try {
                const result = await submitDecisions(
                  detail.securityCase.caseId,
                  user?.userId ?? 0,
                  request,
                )
                void toast.success(
                  result.outcome === 'APPROVAL_PENDING'
                    ? '관리자 승인을 요청했어요. 승인되면 판정이 반영되고 매입이 진행돼요.'
                    : '판정을 확정했습니다. 조치가 요청됐어요.',
                )
                await load()
                return true
              } catch (e) {
                void toast.error(
                  e instanceof CaseVersionConflictError || e instanceof ReauthRequiredError
                    ? e.message
                    : '판정을 저장하지 못했습니다.',
                )
                if (e instanceof CaseVersionConflictError) await load()
                return false
              }
            }}
          />
        </>
      )
    history = detail.history.map((h) => ({
      key: h.historyId,
      at: h.createdAt,
      ...historyText(h),
    }))
  } else {
    const { staffCase } = loaded
    right = (
      <StaffDecision
        staffCase={staffCase}
        locked={aiRunning || !report}
        onDone={() => void load()}
      />
    )
    history = [
      {
        key: 'created',
        at: staffCase.createdAt,
        title: '사건 자동 생성',
        sub: staffCase.groupingBasis,
      },
      ...cards.map((c) => ({ key: `alert-${c.key}`, at: c.at, title: `직원 경보 · ${c.title}` })),
      ...staffCase.actions.map((a) => ({
        key: `act-${a.caseActionId}`,
        at: a.requestedAt,
        title: `조치 · ${ACTION_LABEL[a.actionType]}`,
      })),
    ]
    if (staffCase.closedAt) {
      history.push({ key: 'closed', at: staffCase.closedAt, title: '사건 종료' })
    }
  }

  return (
    <>
      <PageHeader
        title={`${caseTypeLabel[sc.caseType].label} · ${sc.subjectLabel}`}
        description={`${relativeTime(sc.createdAt, now)} 생성`}
        actions={
          <>
            {report && (
              <Link to={`${base}/${sc.caseId}/report`}>
                <Button data-tour="report-open">AI 보고서</Button>
              </Link>
            )}
            {back}
          </>
        }
      />
      <CaseStatusStrip
        caseType={sc.caseType}
        status={sc.status}
        aiRunning={aiRunning}
        report={report}
      />
      <div data-tour="case-flow">
        <CaseFlow
          cards={cards}
          caseType={sc.caseType}
          subjectLabel={sc.subjectLabel}
          groupingBasis={sc.groupingBasis}
          report={report}
          now={now}
        />
      </div>
      <div className="dw-pa-grid">
        <div className="dw-pa-col">
          <div data-tour="case-ai">
            <AiSummaryCard
              report={report}
              run={run}
              reportPath={`${base}/${sc.caseId}/report`}
              now={now}
            />
          </div>
          {loaded.kind === 'payment' ? (
            <PaymentTargets data={loaded} />
          ) : (
            <StaffTargets data={loaded} now={now} />
          )}
          <RawDetails title="원본 값 보기 (사건 번호)" rows={[['사건 번호', sc.caseId]]} />
        </div>
        <div className="dw-pa-col">
          <div data-tour="case-right">{right}</div>
          <CaseHistoryCard rows={history} now={now} />
        </div>
      </div>
    </>
  )
}
