import { Alert, Button, Card, Spin, Steps, Table, Tabs, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getHandoffs } from '../../api/cases'
import { PageHeader } from '../../components/common/PageHeader'
import { RawDetails } from '../../components/explain/RawDetails'
import type { HandoffRow } from '../../types/case'
import { handoffStage } from '../../utils/approvals'
import { koreanWon, relativeTime } from '../../utils/humanize'

type TabKey = 'ALL' | 'RUNNING' | 'DONE'

const ACTION: Record<HandoffRow['actionType'], { label: string; to: string; color: string }> = {
  CAPTURE: { label: '매입 진행', to: '결제 · 정산 모듈', color: 'green' },
  VOID: { label: '승인 취소', to: '결제 모듈', color: 'red' },
}

async function fetchRows(): Promise<HandoffRow[] | null> {
  try {
    return await getHandoffs()
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

export function ActionCenterPage() {
  const [rows, setRows] = useState<HandoffRow[] | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<TabKey>('ALL')
  const [now, setNow] = useState(() => new Date())

  const apply = useCallback((result: HandoffRow[] | null) => {
    if (!result) {
      setError(true)
      return
    }
    setNow(new Date())
    setRows(result)
    setError(false)
  }, [])
  const load = useCallback(() => fetchRows().then(apply), [apply])

  useEffect(() => {
    let alive = true
    void fetchRows().then((result) => {
      if (alive) apply(result)
    })
    return () => {
      alive = false
    }
  }, [apply])

  const header = (
    <PageHeader
      title="조치 센터"
      description="판정 뒤 실제로 요청한 결제 조치입니다. 받는 곳이 요청을 접수하고 결제 상태가 바뀌면 완료됩니다."
    />
  )
  if (error) {
    return (
      <>
        {header}
        <Alert
          type="warning"
          showIcon
          message="조치 목록을 불러오지 못했습니다."
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

  const done = rows.filter((r) => handoffStage(r) === 2)
  const running = rows.filter((r) => handoffStage(r) !== 2)
  const shown = tab === 'ALL' ? rows : tab === 'DONE' ? done : running

  const columns: ColumnsType<HandoffRow> = [
    {
      title: '조치 유형',
      key: 'action',
      width: 130,
      render: (_, r) => (
        <div>
          <Tag color={ACTION[r.actionType].color}>{ACTION[r.actionType].label}</Tag>
          <div className="dw-muted dw-small">→ {ACTION[r.actionType].to}</div>
        </div>
      ),
    },
    {
      title: '대상 결제',
      key: 'target',
      render: (_, r) => (
        <div>
          <b>{r.paymentTitle ?? '상품 정보 없음'}</b>
          <span className="dw-muted">
            {' '}
            · {r.amount === null ? '금액 확인 불가' : koreanWon(r.amount)}
          </span>
          <div className="dw-small">
            <Link to={`/security/cases/${r.caseId}`}>{r.subjectLabel} 사건</Link>
          </div>
          <RawDetails
            title="원본 값"
            rows={[
              ['조치 번호', r.handoffId],
              ['결제 번호', r.paymentId],
              ['오류 코드', r.lastErrorCode ?? '—'],
            ]}
          />
        </div>
      ),
    },
    {
      title: '처리 단계',
      key: 'stage',
      width: 300,
      render: (_, r) => {
        const stage = handoffStage(r)
        return stage < 0 ? (
          <div>
            <Tag color="red">요청 실패</Tag>
            <span className="dw-muted dw-small">다시 시도가 필요해요</span>
          </div>
        ) : (
          <Steps
            size="small"
            current={stage}
            status={stage === 2 ? 'finish' : 'process'}
            items={[{ title: '요청' }, { title: '접수' }, { title: '완료' }]}
          />
        )
      },
    },
    {
      title: '요청 시각',
      dataIndex: 'requestedAt',
      width: 110,
      render: (v: string) => relativeTime(v, now),
    },
  ]

  return (
    <>
      {header}
      <div className="dw-pa-stats">
        <Stat
          label="전체 조치"
          value={rows.length}
          color="#0f172a"
          note="판정 1건 → 결제마다 조치"
        />
        <Stat label="진행 중" value={running.length} color="#2563eb" note="요청 · 접수 단계" />
        <Stat
          label="매입 진행"
          value={rows.filter((r) => r.actionType === 'CAPTURE').length}
          color="#15803d"
          note="결제 완료 → 정산 대상"
        />
        <Stat
          label="승인 취소"
          value={rows.filter((r) => r.actionType === 'VOID').length}
          color="#dc2626"
          note="구매자에게 청구 안 됨"
        />
      </div>
      <Card>
        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as TabKey)}
          items={[
            { key: 'ALL', label: `전체 ${rows.length}` },
            { key: 'RUNNING', label: `진행 중 ${running.length}` },
            { key: 'DONE', label: `완료 ${done.length}` },
          ]}
        />
        <Table
          rowKey="handoffId"
          columns={columns}
          dataSource={shown}
          pagination={false}
          locale={{ emptyText: '조치가 없습니다. 사건을 판정하면 여기에 생겨요.' }}
        />
      </Card>
    </>
  )
}
