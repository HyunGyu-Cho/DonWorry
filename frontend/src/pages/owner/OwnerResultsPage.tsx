import { Alert, Button, Card, Spin, Table, Tabs, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { getOwnerResults } from '../../api/payment'
import { PageHeader } from '../../components/common/PageHeader'
import { RawDetails } from '../../components/explain/RawDetails'
import type { OwnerPaymentResult, OwnerSecurityResult } from '../../types/payment'
import { OWNER_RESULT, OWNER_RESULT_ORDER, ownerCounts } from '../../utils/buyerOwner'
import { koreanWon, relativeTime } from '../../utils/humanize'
import { paymentStatusLabel } from '../security/case/caseLabels'

type TabKey = 'ALL' | OwnerSecurityResult
const STAT_COLOR: Record<OwnerSecurityResult, string> = {
  CHECKING: '#b45309',
  ACCEPTED: '#15803d',
  REJECTED: '#dc2626',
  AUTO_BLOCKED: '#475569',
}

async function fetchResults(): Promise<OwnerPaymentResult[] | null> {
  try {
    return await getOwnerResults()
  } catch {
    return null
  }
}

// 사장님 보안 확인 결과 — 내부 점수 · Rule · AI 원문 · 구매자 개인정보는 보이지 않는다
export function OwnerResultsPage() {
  const [rows, setRows] = useState<OwnerPaymentResult[] | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<TabKey>('ALL')
  const [now, setNow] = useState(() => new Date())

  const apply = useCallback((result: OwnerPaymentResult[] | null) => {
    if (!result) {
      setError(true)
      return
    }
    setNow(new Date())
    setRows(result)
    setError(false)
  }, [])
  const load = useCallback(() => fetchResults().then(apply), [apply])

  useEffect(() => {
    let alive = true
    void fetchResults().then((result) => {
      if (alive) apply(result)
    })
    return () => {
      alive = false
    }
  }, [apply])

  const header = (
    <PageHeader
      title="보안 확인 결과"
      description="돈워리 보안팀이 확인한 우리 가게 결제의 처리 결과예요. 검토 중이어도 주문은 그대로 진행하셔도 돼요 — 사기로 드러나면 손해는 돈워리가 부담해요."
    />
  )
  if (error) {
    return (
      <>
        {header}
        <Alert
          type="warning"
          showIcon
          message="결과를 불러오지 못했습니다."
          action={<Button onClick={() => void load()}>다시 시도</Button>}
        />
      </>
    )
  }
  if (!rows) {
    return (
      <>
        {header}
        <div className="dw-error-view" role="status">
          <Spin size="large" />
        </div>
      </>
    )
  }

  const counts = ownerCounts(rows)
  const shown = tab === 'ALL' ? rows : rows.filter((r) => r.result === tab)
  const columns: ColumnsType<OwnerPaymentResult> = [
    {
      title: '주문',
      key: 'order',
      render: (_, r) => (
        <div>
          <b>{r.orderTitle ?? '상품 정보 없음'}</b>
          <div className="dw-muted dw-small">{koreanWon(r.amount)}</div>
        </div>
      ),
    },
    {
      title: '보안 확인 결과',
      dataIndex: 'result',
      width: 140,
      render: (v: OwnerSecurityResult) => (
        <Tag color={OWNER_RESULT[v].color}>{OWNER_RESULT[v].label}</Tag>
      ),
    },
    {
      title: '실제 처리',
      dataIndex: 'paymentStatus',
      width: 120,
      render: (v: OwnerPaymentResult['paymentStatus']) => (
        <Tag color={paymentStatusLabel[v].color}>{paymentStatusLabel[v].label}</Tag>
      ),
    },
    {
      title: '처리 시각',
      dataIndex: 'processedAt',
      width: 110,
      render: (v: string) => relativeTime(v, now),
    },
    {
      title: '안내',
      key: 'guide',
      render: (_, r) => (
        <div>
          <div>{r.guide}</div>
          <RawDetails title="주문번호" rows={[['주문번호', r.orderRef]]} />
        </div>
      ),
    },
  ]

  return (
    <>
      {header}
      <div className="dw-pa-stats">
        {OWNER_RESULT_ORDER.map((k) => (
          <Card key={k} className="dw-pa-stat">
            <div className="dw-muted dw-small">{OWNER_RESULT[k].label}</div>
            <div className="dw-pa-stat-value" style={{ color: STAT_COLOR[k] }}>
              {counts[k]}
              <small>건</small>
            </div>
            <div className="dw-muted dw-small">{OWNER_RESULT[k].note}</div>
          </Card>
        ))}
      </div>
      <Card>
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as TabKey)}
          items={[
            { key: 'ALL', label: `전체 ${rows.length}` },
            ...OWNER_RESULT_ORDER.map((k) => ({
              key: k,
              label: `${OWNER_RESULT[k].label} ${counts[k]}`,
            })),
          ]}
        />
        <Table
          rowKey="paymentId"
          columns={columns}
          dataSource={shown}
          pagination={false}
          locale={{ emptyText: '해당하는 결제가 없어요.' }}
        />
      </Card>
      <p className="dw-muted dw-small dw-rule-note">
        보안 확인 사유와 기준은 공개하지 않아요. 결과가 바뀌면 메일로도 알려 드려요.
      </p>
    </>
  )
}
