import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Input, Table, Tabs, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createMockFdsEvaluations,
  getFdsEvaluations,
  type FdsEvaluationPage,
  type FdsEvaluationSummary,
  type FdsResult,
} from '../../api/fds'
import { getRules } from '../../api/fdsRules'
import { isMock } from '../../api/mockMode'
import { useFeedback } from '../../components/common/Feedback'
import { PageHeader } from '../../components/common/PageHeader'
import { TermTip } from '../../components/explain/TermTip'
import type { FdsRule } from '../../types/fds'
import { koreanWon, relativeTime } from '../../utils/humanize'
import { TONE_COLOR, verdict } from '../../utils/paymentAlert'

type Filter = 'NEEDS_ATTENTION' | FdsResult | 'ALL'
type Query = { filter: Filter; search: string; page: number }

const PAGE_SIZE = 10

// 목록 한 쪽 + Rule 이름. 실패하면 null
async function fetchAlerts(
  q: Query,
): Promise<{ page: FdsEvaluationPage; rules: FdsRule[] } | null> {
  try {
    const [page, rules] = await Promise.all([
      getFdsEvaluations({
        result: q.filter === 'NEEDS_ATTENTION' || q.filter === 'ALL' ? undefined : q.filter,
        attentionOnly: q.filter === 'NEEDS_ATTENTION',
        search: q.search,
        page: q.page,
        size: PAGE_SIZE,
      }),
      getRules(),
    ])
    return { page, rules }
  } catch {
    return null
  }
}

function Stat(props: { label: string; value: number; color: string; note: string }) {
  return (
    <Card className="dw-pa-stat">
      <div className="dw-muted dw-small">{props.label}</div>
      <div className="dw-pa-stat-value" style={{ color: props.color }}>
        {props.value}
        <small>건</small>
      </div>
      <div className="dw-muted dw-small">{props.note}</div>
    </Card>
  )
}

export function AlertListPage() {
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const [query, setQuery] = useState<Query>({ filter: 'NEEDS_ATTENTION', search: '', page: 0 })
  const [searchText, setSearchText] = useState('')
  const [page, setPage] = useState<FdsEvaluationPage | null>(null)
  const [rules, setRules] = useState<FdsRule[]>([])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())
  const [creating, setCreating] = useState(false)

  const apply = useCallback((result: { page: FdsEvaluationPage; rules: FdsRule[] } | null) => {
    setLoading(false)
    if (!result) {
      setError(true)
      return
    }
    setNow(new Date())
    setPage(result.page)
    setRules(result.rules)
    setError(false)
  }, [])

  useEffect(() => {
    let alive = true
    void fetchAlerts(query).then((result) => {
      if (alive) apply(result)
    })
    return () => {
      alive = false
    }
  }, [query, apply])

  // 조건이 바뀌면 다시 불러온다 (결과는 위 effect가 반영)
  const change = (next: Partial<Query>) => {
    setLoading(true)
    setQuery((q) => ({ ...q, page: 0, ...next }))
  }

  // 실제 백엔드에서만: 시험용 결제 평가를 만든다
  const createSamples = async () => {
    setCreating(true)
    try {
      const created = await createMockFdsEvaluations()
      void toast.success(`시험용 결제 평가 ${created.length}건을 만들었습니다.`)
      change({})
    } catch {
      void toast.error('시험용 평가를 만들지 못했습니다.')
    } finally {
      setCreating(false)
    }
  }

  const nameOf = (code: string) => rules.find((r) => r.ruleCode === code)?.displayName ?? code
  const counts = page?.resultCounts ?? { ALLOW: 0, REVIEW: 0, DENY: 0, ERROR: 0 }
  const attention = counts.REVIEW + counts.DENY + counts.ERROR

  const columns: ColumnsType<FdsEvaluationSummary> = [
    {
      title: '발생 시각',
      dataIndex: 'evaluatedAt',
      width: 110,
      render: (v: string) => relativeTime(v, now),
    },
    {
      title: '결제 정보',
      key: 'payment',
      render: (_, e) => (
        <div>
          <b>
            {e.customerLabel} · {koreanWon(e.amount)}
          </b>
          <div className="dw-muted dw-small">{e.orderTitle ?? '상품 정보 없음'}</div>
        </div>
      ),
    },
    {
      title: '적중 Rule',
      key: 'rules',
      render: (_, e) =>
        e.hitRuleCodes.length === 0 ? (
          <span className="dw-muted">{e.result === 'ERROR' ? '평가하지 못함' : '없음'}</span>
        ) : (
          <span className="dw-pa-chips">
            {e.hitRuleCodes.map((code) => (
              <Tag key={code} color={code === 'BLOCKLIST' ? 'red' : 'blue'}>
                {nameOf(code)}
              </Tag>
            ))}
          </span>
        ),
    },
    {
      title: '판정',
      key: 'verdict',
      width: 150,
      render: (_, e) => {
        const v = verdict(e)
        return (
          <span>
            <Tag color={TONE_COLOR[v.tone]}>{v.label}</Tag>
            {e.riskScore !== null && <span className="dw-muted dw-small">{e.riskScore}점</span>}
          </span>
        )
      },
    },
    {
      title: '사건',
      key: 'case',
      width: 100,
      render: (_, e) =>
        e.caseId ? (
          <Link to={`/security/cases/${e.caseId}`} onClick={(ev) => ev.stopPropagation()}>
            사건 보기
          </Link>
        ) : (
          <span className="dw-muted">—</span>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="결제 경보"
        description="직원 확인(매입 보류) · 거절 · 평가 실패 결제입니다. 행을 누르면 어떤 Rule에 몇 점씩 걸렸는지 봅니다."
        actions={
          <>
            {!isMock('fds') && (
              <Button loading={creating} onClick={() => void createSamples()}>
                시험용 평가 만들기
              </Button>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => change({ page: query.page })}>
              새로 고침
            </Button>
          </>
        }
      />
      <div className="dw-pa-stats">
        <Stat
          label="확인 필요"
          value={attention}
          color="#0f172a"
          note="직원 확인 + 거절 + 평가 실패"
        />
        <Stat
          label="직원 확인"
          value={counts.REVIEW}
          color="#b45309"
          note="매입 보류 → 사건 → AI 조사"
        />
        <Stat label="거절" value={counts.DENY} color="#dc2626" note="카드 승인 요청 없이 막음" />
        <Stat
          label="평가 실패"
          value={counts.ERROR}
          color="#475569"
          note="점수를 못 매겨 직원이 직접 확인"
        />
      </div>
      <Card>
        <div className="dw-pa-toolbar">
          <Tabs
            activeKey={query.filter}
            onChange={(key) => change({ filter: key as Filter })}
            items={[
              { key: 'NEEDS_ATTENTION', label: `확인 필요 ${attention}` },
              { key: 'REVIEW', label: `직원 확인 ${counts.REVIEW}` },
              { key: 'DENY', label: `거절 ${counts.DENY}` },
              { key: 'ERROR', label: `평가 실패 ${counts.ERROR}` },
              {
                key: 'ALL',
                label: `전체 ${attention + counts.ALLOW}`,
              },
            ]}
          />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="고객 이름 · 상품 · 결제 번호"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onPressEnter={() => change({ search: searchText })}
            onClear={() => change({ search: '' })}
            style={{ width: 260 }}
          />
        </div>
        {error ? (
          <Alert
            type="warning"
            showIcon
            message="결제 경보를 불러오지 못했습니다."
            action={<Button onClick={() => change({ page: query.page })}>다시 시도</Button>}
          />
        ) : (
          <Table
            rowKey="evaluationId"
            columns={columns}
            dataSource={page?.content ?? []}
            loading={loading}
            locale={{ emptyText: '조건에 맞는 경보가 없습니다.' }}
            onRow={(e) => ({
              onClick: () => navigate(`/security/alerts/${e.evaluationId}`),
              className: 'dw-pa-row',
              'data-tour': `alert-${e.evaluationId}`,
            })}
            pagination={{
              current: (page?.page ?? 0) + 1,
              pageSize: PAGE_SIZE,
              total: page?.totalElements ?? 0,
              showSizeChanger: false,
              onChange: (p) => change({ page: p - 1 }),
            }}
          />
        )}
      </Card>
      <p className="dw-muted dw-small dw-rule-note">
        <TermTip term="SCORE_BAND" />: 40점 이상이면 직원 확인, 70점 이상이면 거절. 통과한 결제는
        전체 탭에서만 보여요.
      </p>
    </>
  )
}
