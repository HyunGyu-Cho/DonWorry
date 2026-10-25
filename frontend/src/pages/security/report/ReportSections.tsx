import { Card, Tag } from 'antd'
import { Link } from 'react-router-dom'
import type { ConclusionReport, ReportPoint, SimilarCase } from '../../../types/report'
import { koreanWon, relativeTime } from '../../../utils/humanize'
import { MATCH_LABEL, similarSummary } from '../../../utils/reportView'

function Points({ list }: { list: ReportPoint[] }) {
  if (list.length === 0) return <p className="dw-muted">없음</p>
  return (
    <>
      {list.map((p) => (
        <div key={p.title + p.detail} className="dw-rp-point">
          <b>{p.title}</b>
          <div>{p.detail}</div>
          <div className="dw-muted dw-small">{p.source}</div>
        </div>
      ))}
    </>
  )
}

// 위험 근거와 정상 정황을 나란히 — 한쪽만 보고 판단하지 않게
export function ComparePoints({ report }: { report: ConclusionReport }) {
  return (
    <div className="dw-rp-compare">
      <Card
        className="dw-rp-risk"
        title={<span>⚠ 위험 근거</span>}
        extra={<span className="dw-muted dw-small">{report.riskPoints.length}개</span>}
      >
        <Points list={report.riskPoints} />
      </Card>
      <Card
        className="dw-rp-normal"
        title={<span>✓ 정상 정황</span>}
        extra={<span className="dw-muted dw-small">{report.normalPoints.length}개</span>}
      >
        <Points list={report.normalPoints} />
      </Card>
    </div>
  )
}

// 비슷한 과거 사건 — 판정 참고용, 자동 판정에 쓰지 않음. 누르면 그 사건의 최종 보고서
export function SimilarCases(props: { list: SimilarCase[]; base: string; now: Date }) {
  const { list, base, now } = props
  return (
    <Card
      title="비슷한 과거 사건"
      extra={<span className="dw-muted dw-small">판정의 참고 근거 · 자동 판정에 쓰지 않음</span>}
    >
      {list.map((s) => (
        <Link key={s.caseId} to={`${base}/${s.caseId}/report`} className="dw-rp-similar">
          <Tag color={s.outcome === 'FRAUD' ? 'red' : 'green'}>
            {s.outcome === 'FRAUD' ? '사기 확정' : '정상 확인'}
          </Tag>
          <div>
            <b>{s.title}</b>
            <span className="dw-muted dw-small"> · {relativeTime(s.occurredAt, now)}</span>
            <div className="dw-muted dw-small">{s.outcomeLabel}</div>
            <div className="dw-pa-chips">
              {s.matches.map((m) => (
                <Tag key={m} color={m === 'RULE_COMBO' ? 'default' : 'magenta'}>
                  {MATCH_LABEL[m]}
                </Tag>
              ))}
            </div>
          </div>
          <Tag color={s.strength === 'STRONG' ? 'red' : 'default'}>
            {s.strength === 'STRONG' ? '강하게 비슷' : '비슷'}
          </Tag>
        </Link>
      ))}
      <div className="dw-rp-simsum">{similarSummary(list)}</div>
    </Card>
  )
}

export function Timeline({ report, now }: { report: ConclusionReport; now: Date }) {
  return (
    <Card title="사건 경위" extra={<span className="dw-muted dw-small">시간순</span>}>
      <ol className="dw-rp-timeline">
        {report.timeline.map((t, i) => (
          <li key={i} className={`dw-rp-tl-${t.kind.toLowerCase()}`}>
            <span className="dw-muted dw-small">{relativeTime(t.at, now)}</span>
            <span>{t.text}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

export function Checks({ report }: { report: ConclusionReport }) {
  return (
    <Card title="판정 전에 확인할 것">
      <div className="dw-muted dw-small dw-rp-subhead">AI가 아직 모르는 것</div>
      {report.unknowns.length === 0 && <p className="dw-muted">없음</p>}
      {report.unknowns.map((u) => (
        <div key={u} className="dw-rp-check is-unknown">
          {u}
        </div>
      ))}
      <div className="dw-muted dw-small dw-rp-subhead">먼저 해 볼 것</div>
      {report.checks.length === 0 && <p className="dw-muted">없음</p>}
      {report.checks.map((c) => (
        <div key={c} className="dw-rp-check">
          {c}
        </div>
      ))}
    </Card>
  )
}

const REC: Record<string, [string, string]> = {
  ACCEPT_REVIEW: ['매입 진행 검토', 'green'],
  REJECT_REVIEW: ['승인 취소 검토', 'red'],
  NEEDS_CHECK: ['추가 확인 먼저', 'gold'],
}

export function PaymentRecommendations({ report }: { report: ConclusionReport }) {
  if (!report.paymentRecommendations?.length) return null
  return (
    <Card title="결제별 권고">
      <div className="dw-rp-perpay">
        {report.paymentRecommendations.map((p) => (
          <div key={p.paymentId} className="dw-rp-perpay-item">
            <div className="dw-case-drow-head">
              <b>{p.label}</b>
              <Tag color={REC[p.recommendation][1]}>{REC[p.recommendation][0]}</Tag>
            </div>
            <div className="dw-muted dw-small">
              {p.amount === null ? '금액 확인 불가' : koreanWon(p.amount)}
            </div>
            <div className="dw-small">{p.reason}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// 상세 근거와 보고서 정보 — 기본은 접어 둔다
export function EvidenceDetails({ report, now }: { report: ConclusionReport; now: Date }) {
  return (
    <details className="dw-rp-more">
      <summary>상세 근거와 보고서 정보 펼치기</summary>
      <ol className="dw-rp-evidence">
        {report.evidence.map((e) => (
          <li key={e.evidenceId}>
            <b>{e.source}</b> · {e.description}
            {e.retrievedAt && (
              <span className="dw-muted dw-small"> · {relativeTime(e.retrievedAt, now)} 조회</span>
            )}
          </li>
        ))}
      </ol>
      <dl className="dw-rule-rows">
        <dt>모델</dt>
        <dd>{report.model}</dd>
        <dt>생성</dt>
        <dd>
          {relativeTime(report.generatedAt, now)} · 보고서 v{report.reportVersion}
        </dd>
        <dt>한계</dt>
        <dd>
          {report.limitations.map((l) => (
            <div key={l}>· {l}</div>
          ))}
        </dd>
      </dl>
    </details>
  )
}
