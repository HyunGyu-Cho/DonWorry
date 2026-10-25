import { Button, Card, Steps, Tag } from 'antd'
import { Link } from 'react-router-dom'
import { TracePanel } from '../../../components/report/TracePanel'
import { riskLevelLabel } from '../../../config/reportLevel'
import type { CaseStatus, CaseType } from '../../../types/case'
import type { ConclusionReport, ReportRun } from '../../../types/report'
import { relativeTime } from '../../../utils/humanize'
import { autoFlow, caseStage, caseStages, type FlowCard } from '../../../utils/caseView'
import { caseStatusLabel, caseTypeLabel } from './caseLabels'

// 상태 띠: 유형 · 상태 태그 + 자동 흐름 한 줄 + 단계 5칸
export function CaseStatusStrip(props: {
  caseType: CaseType
  status: CaseStatus
  aiRunning: boolean
  report: ConclusionReport | null
}) {
  const { caseType, status, aiRunning, report } = props
  const stage = caseStage(status, aiRunning)
  return (
    <Card className="dw-case-strip">
      <div className="dw-case-strip-left">
        <Tag color={caseTypeLabel[caseType].color}>{caseTypeLabel[caseType].label}</Tag>
        <Tag color={aiRunning ? 'processing' : caseStatusLabel[status].color}>
          {aiRunning ? 'AI 조사 중' : caseStatusLabel[status].label}
        </Tag>
        {report && (
          <Tag color={report.riskScore >= 70 ? 'red' : 'gold'}>
            위험도 {report.riskScore} · {riskLevelLabel(report.riskScore)}
          </Tag>
        )}
        <span className="dw-case-autoflow">
          {autoFlow(caseType).map((step, i) => (
            <span key={step}>
              {i > 0 && ' → '}
              {i < 3 ? <b>{step}</b> : step}
            </span>
          ))}
        </span>
      </div>
      <Steps
        size="small"
        current={Math.min(stage, 4)}
        status={stage >= 5 ? 'finish' : 'process'}
        items={caseStages(caseType).map((title) => ({ title }))}
        className="dw-case-steps"
      />
    </Card>
  )
}

// 흩어진 경보를 하나의 사건으로: 왼쪽 경보 카드들 → 오른쪽 사건 카드
export function CaseFlow(props: {
  cards: FlowCard[]
  caseType: CaseType
  subjectLabel: string
  groupingBasis: string
  report: ConclusionReport | null
  now: Date
}) {
  const { cards, caseType, subjectLabel, groupingBasis, report, now } = props
  return (
    <Card
      title="흩어진 경보를 하나의 사건으로"
      extra={<span className="dw-muted dw-small">하나씩 보면 정상, 묶어야 보이는 공격</span>}
      className="dw-case-flow-card"
    >
      <div className="dw-case-flow">
        <div className="dw-case-flow-col">
          {cards.map((c) => {
            const inner = (
              <>
                <div className="dw-flowcard-top">
                  <Tag color={c.staff ? 'magenta' : 'gold'}>{c.badge}</Tag>
                  <span className="dw-muted dw-small">{relativeTime(c.at, now)}</span>
                </div>
                <b>{c.title}</b>
                <div className="dw-flowcard-desc">{c.rules.join(' · ')}</div>
                {c.alone && <div className="dw-flowcard-alone">{c.alone}</div>}
              </>
            )
            return c.href ? (
              <Link key={c.key} to={c.href} className="dw-flowcard is-link">
                {inner}
              </Link>
            ) : (
              <div key={c.key} className="dw-flowcard">
                {inner}
              </div>
            )
          })}
        </div>
        <div className="dw-case-flow-arrow" aria-hidden>
          ➜
        </div>
        <div className="dw-casecard">
          <div className="dw-casecard-top">
            {subjectLabel} · 위험도 {report ? riskLevelLabel(report.riskScore) : '분석 중'}
          </div>
          <div className="dw-casecard-title">{caseTypeLabel[caseType].label}</div>
          <div className="dw-casecard-basis">
            묶은 기준 <b>{groupingBasis}</b>
          </div>
          <ul className="dw-casecard-tl">
            {cards.map((c) => (
              <li key={c.key}>
                <span>{relativeTime(c.at, now)}</span>
                {c.title}
              </li>
            ))}
          </ul>
          <div className="dw-casecard-foot">경보 {cards.length}건 → 사건 1건</div>
        </div>
      </div>
    </Card>
  )
}

// AI 조사 요약 — 전문 화면은 1-7. 조사 중이면 지금 단계만 보여 준다
export function AiSummaryCard(props: {
  report: ConclusionReport | null
  run: ReportRun | null
  reportPath: string
  now: Date
}) {
  const { report, run, reportPath, now } = props
  // 조사 중이면 결론 대신 과정을 실시간으로 (보고서 화면은 끝난 뒤에 생긴다)
  if (run?.status === 'RUNNING') {
    return (
      <Card
        title={
          <span>
            <span className="dw-live-dot" aria-hidden />
            AI가 지금 조사하고 있어요 · v{run.reportVersion}
          </span>
        }
        extra={<span className="dw-muted dw-small">단계가 끝날 때마다 아래로 그려져요</span>}
      >
        {report && (
          <p className="dw-muted dw-small">
            새 정보가 들어와 다시 조사하는 중이에요. 지난 보고서(v{report.reportVersion})는 [AI
            보고서]에서 볼 수 있어요.
          </p>
        )}
        <TracePanel steps={run.steps} live startedAt={run.startedAt} now={now} />
      </Card>
    )
  }
  if (!report) {
    return (
      <Card title="AI 조사 요약">
        <p className="dw-muted">아직 보고서가 없습니다. 조사가 끝나면 여기에 결론이 나와요.</p>
      </Card>
    )
  }
  return (
    <Card
      title={`AI 조사 요약 · v${report.reportVersion}`}
      extra={
        <Link to={reportPath}>
          <Button size="small" type="primary">
            전문 보기
          </Button>
        </Link>
      }
    >
      <div className="dw-case-ai">
        <div
          className={`dw-pa-score-num dw-pa-score-num--${report.riskScore >= 70 ? 'bad' : 'warn'}`}
        >
          <b>{report.riskScore}</b>
        </div>
        <div>
          <b className="dw-case-ai-verdict">{report.verdict}</b>
          <p className="dw-muted dw-case-ai-summary">{report.summary}</p>
        </div>
      </div>
      <div className="dw-pa-chips">
        {report.recommendations.map((r) => (
          <Tag
            key={r.label}
            color={r.kind === 'NEGATIVE' ? 'red' : r.kind === 'POSITIVE' ? 'green' : 'blue'}
          >
            {r.label}
          </Tag>
        ))}
      </div>
      {/* 끝난 조사도 사건 화면에서 바로 다시 볼 수 있게 (자세한 건 [AI 보고서]의 과정 탭) */}
      {report.trace.length > 0 && (
        <details className="dw-case-trace-again">
          <summary>조사 과정 다시 보기</summary>
          <TracePanel steps={report.trace} model={report.model} />
        </details>
      )}
    </Card>
  )
}

export type HistoryRow = { key: string; at: string; title: string; sub?: string }

// 사건 기록 — 추가만 가능 (최신이 위)
export function CaseHistoryCard({ rows, now }: { rows: HistoryRow[]; now: Date }) {
  return (
    <Card title="사건 기록" extra={<span className="dw-muted dw-small">추가만 가능</span>}>
      {[...rows]
        .sort((a, b) => b.at.localeCompare(a.at))
        .map((r) => (
          <div key={r.key} className="dw-case-hist">
            <span className="dw-muted">{relativeTime(r.at, now)}</span>
            <div>
              <b>{r.title}</b> {r.sub && <span className="dw-muted">{r.sub}</span>}
            </div>
          </div>
        ))}
    </Card>
  )
}
