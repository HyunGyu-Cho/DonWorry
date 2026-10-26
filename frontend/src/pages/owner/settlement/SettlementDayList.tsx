import { Input, Segmented, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useState } from 'react'
import type { CalendarStage } from '../../../types/settlement'
import { koreanWon } from '../../../utils/humanize'
import {
  type CalendarItem,
  daySummary,
  filterDayItems,
  STAGE_ORDER,
  STAGE_VIEW,
} from '../../../utils/settlementView'

const STAGE_COLOR: Record<CalendarStage, string> = {
  COMPLETED: 'green',
  SCHEDULED: 'blue',
  EXPECTED: 'default',
  OUTFLOW: 'red',
}

// 하루치 정산 · 출금 목록 — 옆 목록 창과 전체 페이지가 같이 쓴다
export function SettlementDayList({ rows }: { rows: CalendarItem[] }) {
  const [stage, setStage] = useState<CalendarStage | 'ALL'>('ALL')
  const [query, setQuery] = useState('')
  const sum = daySummary(rows)
  const shown = filterDayItems(rows, stage, query)
  const columns: ColumnsType<CalendarItem> = [
    {
      title: '상태',
      dataIndex: 'stage',
      width: 110,
      render: (v: CalendarStage) => <Tag color={STAGE_COLOR[v]}>{STAGE_VIEW[v].label}</Tag>,
    },
    { title: '주문 · 출금', dataIndex: 'title' },
    {
      title: '결제 금액',
      dataIndex: 'gross',
      align: 'right',
      render: (v: number | undefined) => (v === undefined ? '—' : koreanWon(v)),
    },
    {
      title: '수수료',
      dataIndex: 'fee',
      align: 'right',
      render: (v: number | undefined) => (v === undefined ? '—' : koreanWon(v)),
    },
    {
      title: '받는 돈 · 나가는 돈',
      key: 'amount',
      align: 'right',
      render: (_, r) => (
        <b className={r.stage === 'OUTFLOW' ? 'dw-stl-out' : 'dw-stl-in'}>
          {r.stage === 'OUTFLOW' ? '−' : '+'}
          {koreanWon(r.amount)}
        </b>
      ),
    },
  ]
  return (
    <div className="dw-stl-list">
      <p className="dw-stl-list-sum">
        들어올 돈 <b className="dw-stl-in">+{koreanWon(sum.inflow)}</b> · {sum.inflowCount}건
        {sum.outflowCount > 0 && (
          <>
            {' '}
            · 나갈 돈 <b className="dw-stl-out">−{koreanWon(sum.outflow)}</b> · {sum.outflowCount}건
          </>
        )}
      </p>
      <div className="dw-stl-list-tools">
        <Segmented<CalendarStage | 'ALL'>
          size="small"
          value={stage}
          onChange={setStage}
          options={[
            { label: `전체 ${rows.length}`, value: 'ALL' },
            ...STAGE_ORDER.filter((s) => sum.byStage[s].count > 0).map((s) => ({
              label: `${STAGE_VIEW[s].label} ${sum.byStage[s].count}`,
              value: s,
            })),
          ]}
        />
        <Input.Search
          size="small"
          allowClear
          placeholder="주문 이름으로 찾기"
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 220 }}
        />
      </div>
      <Table
        rowKey="key"
        size="small"
        columns={columns}
        dataSource={shown}
        pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }}
        locale={{ emptyText: '조건에 맞는 주문이 없어요.' }}
      />
    </div>
  )
}
