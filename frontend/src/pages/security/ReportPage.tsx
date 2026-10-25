import { ArrowLeftOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Result, Spin, Tabs } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getCase } from '../../api/cases'
import { getStaffCase } from '../../api/investigation'
import { StaffCaseForbiddenError } from '../../api/investigationErrors'
import { getCaseReport, getReportRun } from '../../api/report'
import { toConclusionReport } from '../../api/reportConvert'
import { StaffReportForbiddenError } from '../../api/reportErrors'
import { useAuth } from '../../auth/useAuth'
import { ConclusionCard } from '../../components/explain/ConclusionCard'
import { PageHeader } from '../../components/common/PageHeader'
import { TracePanel } from '../../components/report/TracePanel'
import { useDemo } from '../../demo/DemoContext'
import type { CaseStatus, CaseType } from '../../types/case'
import type { ConclusionReport, ReportRun } from '../../types/report'
import { latestReport } from '../../utils/caseRules'
import { reportPageState } from '../../utils/reportView'
import { caseTypeLabel } from './case/caseLabels'
import {
  Checks,
  ComparePoints,
  EvidenceDetails,
  PaymentRecommendations,
  SimilarCases,
  Timeline,
} from './report/ReportSections'

type CaseInfo = { caseType: CaseType; status: CaseStatus; subjectLabel: string }
type Data = { report: ConclusionReport | null; run: ReportRun | null; info: CaseInfo | null }
type Loaded = Data | 'forbidden' | 'error'

// 보고서 · 조사 기록 · 사건 정보. 실제 서버에 새 보고서가 없으면 사건의 옛 보고서를 바꿔 쓴다
async function fetchReport(id: string, merchant: string): Promise<Loaded> {
  try {
    const [report, run] = await Promise.all([getCaseReport(id), getReportRun(id).catch(() => null)])
    const detail = await getCase(id, merchant).catch(() => null)
    if (detail) {
      const legacy = latestReport(detail.reports)?.reportBody
      return {
        report: report ?? (legacy ? toConclusionReport(legacy) : null),
        run,
        info: detail.securityCase,
      }
    }
    const staff = await getStaffCase(id)
    return { report, run, info: staff }
  } catch (e) {
    if (e instanceof StaffReportForbiddenError || e instanceof StaffCaseForbiddenError) {
      return 'forbidden'
    }
    return 'error'
  }
}

export function ReportPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { merchant } = useDemo()
  const { user } = useAuth()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [tab, setTab] = useState('report')
  const [now, setNow] = useState(() => new Date())
  const base = user?.role === 'SECURITY_MANAGER' ? '/manager/cases' : '/security/cases'

  const apply = useCallback((result: Loaded) => {
    setNow(new Date())
    setLoaded(result)
  }, [])
  const load = useCallback(() => fetchReport(id, merchant).then(apply), [id, merchant, apply])

  useEffect(() => {
    let alive = true
    void fetchReport(id, merchant).then((result) => {
      if (alive) apply(result)
    })
    return () => {
      alive = false
    }
  }, [id, merchant, apply])

  const back = (
    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`${base}/${id}`)}>
      사건으로
    </Button>
  )
  if (loaded === null) {
    return (
      <>
        <PageHeader title="AI 조사 보고서" actions={back} />
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
        subTitle="직원 계정 사건 보고서는 대상 직원이 어떤 증거가 잡혔는지 알 수 없도록 보안 관리자만 엽니다."
        extra={back}
      />
    )
  }
  if (loaded === 'error') {
    return (
      <>
        <PageHeader title="AI 조사 보고서" actions={back} />
        <Alert
          type="warning"
          showIcon
          message="보고서를 불러오지 못했습니다."
          action={<Button onClick={() => void load()}>다시 시도</Button>}
        />
      </>
    )
  }

  const { report, run, info } = loaded
  const state = reportPageState(report, run)
  if (state === 'NOT_READY' || state === 'NONE' || !report) {
    return (
      <Result
        status="info"
        title={state === 'NOT_READY' ? 'AI가 아직 조사하고 있어요' : '아직 보고서가 없어요'}
        subTitle={
          state === 'NOT_READY'
            ? '보고서는 조사가 끝나면 생겨요. 진행 과정은 사건 화면에서 실시간으로 볼 수 있어요.'
            : '조사가 시작되면 사건 화면에서 진행 과정을 볼 수 있어요.'
        }
        extra={
          <Link to={`${base}/${id}`}>
            <Button type="primary">사건 화면에서 보기</Button>
          </Link>
        }
      />
    )
  }

  const closed = info?.status === 'CLOSED'
  const typeLabel = caseTypeLabel[info?.caseType ?? report.reportType].label
  const canDecide = info?.status === 'DECISION_PENDING'

  return (
    <>
      <PageHeader
        title="AI 조사 보고서"
        description={
          closed
            ? `${typeLabel} · ${info?.subjectLabel ?? ''} · 종료된 사건이라 바꿀 수 없어요`
            : '결론 → 근거 비교 → 비슷한 사건 → 경위 → 확인할 것 순서로 읽어요. 보안 담당자 전용 (사장님 · 구매자 비공개)'
        }
        actions={
          <>
            {back}
            {canDecide && (
              <Link to={`${base}/${id}`}>
                <Button type="primary">판정하러 가기</Button>
              </Link>
            )}
          </>
        }
      />
      {state === 'RERUNNING' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`새 정보가 들어와 v${run?.reportVersion} 보고서를 조사하고 있어요`}
          description="끝나면 이 보고서가 새 버전으로 바뀌어요. 진행 과정은 사건 화면에서 볼 수 있어요."
        />
      )}
      <Card className="dw-rp-tabs">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: 'report', label: '보고서' },
            { key: 'trace', label: 'AI가 조사한 과정' },
          ]}
        />
      </Card>
      {tab === 'report' ? (
        <div className="dw-pa-col">
          <ConclusionCard
            score={report.riskScore}
            eyebrow={`${typeLabel} · ${info?.subjectLabel ?? ''} · 보고서 v${report.reportVersion}`}
            verdict={report.verdict}
            summary={report.summary}
            recommendations={report.recommendations}
          />
          <ComparePoints report={report} />
          <SimilarCases list={report.similarCases} base={base} now={now} />
          <div className="dw-rp-two">
            <Timeline report={report} now={now} />
            <Checks report={report} />
          </div>
          <PaymentRecommendations report={report} />
          <EvidenceDetails report={report} now={now} />
        </div>
      ) : (
        <Card title={`AI가 조사한 과정 · v${report.reportVersion}`}>
          {report.trace.length === 0 ? (
            <p className="dw-muted">
              이 보고서는 조사 과정 기록이 없는 예전 형식이에요. 새로 만든 보고서부터 단계가 남아요.
            </p>
          ) : (
            <TracePanel steps={report.trace} model={report.model} />
          )}
        </Card>
      )}
    </>
  )
}
