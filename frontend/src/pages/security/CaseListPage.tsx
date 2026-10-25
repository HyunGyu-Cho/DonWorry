import { ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Table, Tabs, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { demoCreateHeldPayment, getCases } from '../../api/cases'
import { getRules, getStaffAlerts } from '../../api/fdsRules'
import { getStaffCases } from '../../api/investigation'
import { isMock } from '../../api/mockMode'
import { useFeedback } from '../../components/common/Feedback'
import { PageHeader } from '../../components/common/PageHeader'
import { TermTip } from '../../components/explain/TermTip'
import { useDemo } from '../../demo/DemoContext'
import type { CaseStatus, CaseType, ReportStatus } from '../../types/case'
import type { FdsRule, RuleCode, StaffAlert } from '../../types/fds'
import { koreanWon, relativeTime } from '../../utils/humanize'
import { caseStatusLabel, caseTypeLabel, reportStatusLabel } from './case/caseLabels'

// 결제 사건(보안 직원) · 직원 사건(보안 관리자)을 같은 모양의 행으로
type Row = {
  caseId: string
  caseType: CaseType
  status: CaseStatus
  subjectLabel: string
  sub: string
  rules: string[]
  reportStatus: ReportStatus | null
  createdAt: string
}
type Scope = 'payment' | 'staff'
type TabKey = 'ALL' | 'DECISION' | 'APPROVAL' | 'AI' | 'CLOSED'

const TAB_STATUS: Record<Exclude<TabKey, 'ALL'>, CaseStatus[]> = {
  DECISION: ['DECISION_PENDING'],
  APPROVAL: ['APPROVAL_PENDING'],
  AI: ['OPEN', 'INVESTIGATING'],
  CLOSED: ['CLOSED'],
}

async function fetchRows(scope: Scope, merchant: string): Promise<Row[] | null> {
  try {
    const rules = await getRules()
    const name = (code: RuleCode) =>
      rules.find((r: FdsRule) => r.ruleCode === code)?.displayName ?? code
    if (scope === 'payment') {
      const cases = await getCases(merchant)
      return cases.map((c) => ({
        caseId: c.caseId,
        caseType: c.caseType,
        status: c.status,
        subjectLabel: c.subjectLabel,
        sub: `결제 ${c.paymentCount}건 · ${c.totalAmount === null ? '금액 확인 불가' : koreanWon(c.totalAmount)}${c.maxRiskScore === null ? '' : ` · 최고 ${c.maxRiskScore}점`}`,
        rules: (c.hitRuleCodes ?? []).map(name),
        reportStatus: c.latestReportStatus,
        createdAt: c.createdAt,
      }))
    }
    const [cases, alerts] = await Promise.all([getStaffCases(), getStaffAlerts()])
    return cases.map((c) => ({
      caseId: c.caseId,
      caseType: c.caseType,
      status: c.status,
      subjectLabel: c.subjectLabel,
      sub: `직원 경보 ${c.staffHitIds.length}건 · ${c.groupingBasis}`,
      rules: [
        ...new Set(
          alerts
            .filter((a: StaffAlert) => c.staffHitIds.includes(a.staffHitId))
            .map((a) => name(a.ruleCode)),
        ),
      ],
      reportStatus: null,
      createdAt: c.createdAt,
    }))
  } catch {
    return null
  }
}

export function CaseListPage({ scope = 'payment' }: { scope?: Scope }) {
  const navigate = useNavigate()
  const { merchant } = useDemo()
  const { toast } = useFeedback()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<TabKey>('ALL')
  const [now, setNow] = useState(() => new Date())
  const [creating, setCreating] = useState(false)
  const base = scope === 'payment' ? '/security/cases' : '/manager/cases'

  const apply = useCallback((result: Row[] | null) => {
    if (!result) {
      setError(true)
      return
    }
    setNow(new Date())
    setRows(result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    setError(false)
  }, [])
  const load = useCallback(() => fetchRows(scope, merchant).then(apply), [scope, merchant, apply])

  useEffect(() => {
    let alive = true
    void fetchRows(scope, merchant).then((result) => {
      if (alive) apply(result)
    })
    return () => {
      alive = false
    }
  }, [scope, merchant, apply])

  // 실제 백엔드에서만: 매입 보류 결제를 만들어 사건이 생기는 장면을 본다
  const createHeld = async () => {
    setCreating(true)
    try {
      const caseId = await demoCreateHeldPayment()
      void toast.success('매입 보류 결제를 만들었습니다. 사건이 자동으로 생겼어요.')
      navigate(`${base}/${caseId}`)
    } catch {
      void toast.error('시연 결제를 만들지 못했습니다.')
    } finally {
      setCreating(false)
    }
  }

  const all = rows ?? []
  const count = (key: TabKey) =>
    key === 'ALL' ? all.length : all.filter((r) => TAB_STATUS[key].includes(r.status)).length
  const shown = tab === 'ALL' ? all : all.filter((r) => TAB_STATUS[tab].includes(r.status))

  const columns: ColumnsType<Row> = [
    {
      title: '누구 · 무슨 사건',
      key: 'who',
      render: (_, r) => (
        <div>
          <b>{r.subjectLabel}</b>
          <div>
            <Tag color={caseTypeLabel[r.caseType].color}>{caseTypeLabel[r.caseType].label}</Tag>
            <span className="dw-muted dw-small">{r.sub}</span>
          </div>
        </div>
      ),
    },
    {
      title: '상태',
      dataIndex: 'status',
      width: 130,
      render: (s: CaseStatus) => (
        <Tag color={caseStatusLabel[s].color}>{caseStatusLabel[s].label}</Tag>
      ),
    },
    {
      title: '묶인 경보',
      key: 'rules',
      render: (_, r) => (
        <span className="dw-pa-chips">
          {r.rules.map((name) => (
            <Tag key={name} color={scope === 'staff' ? 'magenta' : 'blue'}>
              {name}
            </Tag>
          ))}
        </span>
      ),
    },
    {
      title: 'AI 보고서',
      key: 'report',
      width: 110,
      render: (_, r) =>
        r.reportStatus ? (
          <Tag color={reportStatusLabel[r.reportStatus].color}>
            {reportStatusLabel[r.reportStatus].label}
          </Tag>
        ) : (
          <span className="dw-muted">상세에서 확인</span>
        ),
    },
    {
      title: '생성',
      dataIndex: 'createdAt',
      width: 110,
      render: (v: string) => relativeTime(v, now),
    },
  ]

  return (
    <>
      <PageHeader
        title={scope === 'payment' ? '사건 목록' : '직원 계정 사건'}
        description={
          scope === 'payment'
            ? '결제 경보를 묶어 만든 사건입니다. 사건마다 AI가 조사하고, 보안 직원이 판정합니다.'
            : '돈워리 직원 계정을 노린 공격 사건입니다. 직원 본인이 아닌 보안 관리자가 판정합니다 (직무 분리).'
        }
        actions={
          <>
            {scope === 'payment' && !isMock('investigation') && (
              <Button loading={creating} onClick={() => void createHeld()}>
                시연: 매입 보류 결제 만들기
              </Button>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>
              새로 고침
            </Button>
          </>
        }
      />
      <Card>
        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as TabKey)}
          items={[
            { key: 'ALL', label: `전체 ${count('ALL')}` },
            { key: 'DECISION', label: `판정 대기 ${count('DECISION')}` },
            { key: 'APPROVAL', label: `관리자 승인 대기 ${count('APPROVAL')}` },
            { key: 'AI', label: `AI 조사 중 ${count('AI')}` },
            { key: 'CLOSED', label: `종료 ${count('CLOSED')}` },
          ]}
        />
        {error ? (
          <Alert
            type="warning"
            showIcon
            message="사건 목록을 불러오지 못했습니다."
            action={<Button onClick={() => void load()}>다시 시도</Button>}
          />
        ) : (
          <Table
            rowKey="caseId"
            columns={columns}
            dataSource={shown}
            loading={rows === null}
            pagination={false}
            locale={{ emptyText: '조건에 맞는 사건이 없습니다.' }}
            onRow={(r) => ({
              onClick: () => navigate(`${base}/${r.caseId}`),
              className: 'dw-pa-row',
              'data-tour': `case-${r.caseId}`,
            })}
          />
        )}
      </Card>
      <p className="dw-muted dw-small dw-rule-note">
        <TermTip term="CASE" />은 같은 고객 · 같은 직원 계정의 경보를 시간 창으로 묶어 자동으로
        생깁니다. AI는 권고만 하고 판정은 사람이 합니다.
      </p>
    </>
  )
}
