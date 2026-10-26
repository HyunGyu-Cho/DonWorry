import { Alert, Button, Calendar, Card, Drawer, Spin } from 'antd'
import koKR from 'antd/es/calendar/locale/ko_KR'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFundForecast, getSettlements } from '../../api/settlement'
import { PageHeader } from '../../components/common/PageHeader'
import { RawDetails } from '../../components/explain/RawDetails'
import { kstDate } from '../../config/settlement'
import type { ScheduledTransfer, SettlementEntry } from '../../types/settlement'
import { koreanWon } from '../../utils/humanize'
import {
  busiestDay,
  calendarItems,
  type CalendarItem,
  DAY_PREVIEW,
  daySummary,
  monthDay,
  monthSummary,
  STAGE_ORDER,
  STAGE_VIEW,
} from '../../utils/settlementView'
import { SettlementDayList } from './settlement/SettlementDayList'

type Data = { settlements: SettlementEntry[]; transfers: ScheduledTransfer[] }

// 달력에 보이는 칸(앞뒤 달 일부 포함)까지 넉넉히 가져온다
async function fetchMonth(month: string): Promise<Data | null> {
  const first = dayjs(`${month}-01`)
  try {
    const [settlements, forecast] = await Promise.all([
      getSettlements(
        first.subtract(7, 'day').format('YYYY-MM-DD'),
        first.endOf('month').add(14, 'day').format('YYYY-MM-DD'),
      ),
      getFundForecast(),
    ])
    return { settlements, transfers: forecast.transfers }
  } catch {
    return null
  }
}

// 사장님 정산 캘린더 — 언제 얼마가 들어오고 나가는지 한 달 단위로
export function SettlementCalendarPage() {
  const [today] = useState(() => kstDate(new Date()))
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [selected, setSelected] = useState(today)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [listOpen, setListOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let alive = true
    void fetchMonth(month).then((result) => {
      if (!alive) return
      setData(result)
      setError(!result)
    })
    return () => {
      alive = false
    }
  }, [month, retry])

  const items = useMemo(
    () =>
      data ? calendarItems(data.settlements, data.transfers) : new Map<string, CalendarItem[]>(),
    [data],
  )

  const header = (
    <PageHeader
      title="정산 캘린더"
      description="케이크 판매 대금이 언제 통장에 들어오는지, 언제 돈이 나가는지 날짜별로 보여 드려요. 픽업이 끝나고 3일(72시간) 뒤에 정산돼요."
    />
  )
  if (error) {
    return (
      <>
        {header}
        <Alert
          type="warning"
          showIcon
          message="정산 일정을 불러오지 못했습니다."
          action={<Button onClick={() => setRetry((n) => n + 1)}>다시 시도</Button>}
        />
      </>
    )
  }
  if (!data) {
    return (
      <>
        {header}
        <div className="dw-error-view" role="status">
          <Spin size="large" />
        </div>
      </>
    )
  }

  const summary = monthSummary(items, month)
  const dayRows = items.get(selected) ?? []
  const day = daySummary(dayRows)
  const busy = busiestDay(items, month)
  // 오른쪽 칸 미리 보기: 들어올 돈 앞 몇 건 + 나갈 돈 전부
  const preview = [
    ...dayRows.filter((r) => r.stage !== 'OUTFLOW').slice(0, DAY_PREVIEW),
    ...dayRows.filter((r) => r.stage === 'OUTFLOW'),
  ]
  const [, m] = month.split('-').map(Number)

  return (
    <>
      {header}
      <div className="dw-pa-stats">
        <Card className="dw-pa-stat">
          <div className="dw-muted dw-small">{m}월에 받은 돈</div>
          <div className="dw-pa-stat-value dw-stl-in">{koreanWon(summary.received)}</div>
          <div className="dw-muted dw-small">수수료를 뺀 금액이에요</div>
        </Card>
        <Card className="dw-pa-stat">
          <div className="dw-muted dw-small">{m}월에 받을 돈</div>
          <div className="dw-pa-stat-value dw-stl-plan">{koreanWon(summary.toReceive)}</div>
          <div className="dw-muted dw-small">픽업 전 주문은 늦어질 수 있어요</div>
        </Card>
        <Card className="dw-pa-stat">
          <div className="dw-muted dw-small">{m}월에 나갈 돈</div>
          <div className="dw-pa-stat-value dw-stl-out">{koreanWon(summary.outflow)}</div>
          <div className="dw-muted dw-small">은행에 등록된 자동이체</div>
        </Card>
      </div>
      <div className="dw-stl-legend">
        {STAGE_ORDER.map((s) => (
          <span key={s}>
            <i className={`dw-stl-chip dw-stl-${s}`} aria-hidden /> <b>{STAGE_VIEW[s].label}</b>{' '}
            <span className="dw-muted">{STAGE_VIEW[s].note}</span>
          </span>
        ))}
      </div>
      <div className="dw-stl-layout">
        <Card className="dw-stl-calendar">
          <Calendar
            value={dayjs(selected)}
            onSelect={(d: Dayjs) => setSelected(d.format('YYYY-MM-DD'))}
            locale={koKR}
            onPanelChange={(d: Dayjs) => {
              setMonth(d.format('YYYY-MM'))
              setSelected(d.format('YYYY-MM-DD'))
            }}
            // 연 · 월 전환 대신 이전 달 · 다음 달 버튼만 (사장님이 헷갈리지 않게)
            headerRender={({ value, onChange }) => (
              <div className="dw-stl-head">
                <Button onClick={() => onChange(value.subtract(1, 'month'))}>‹ 이전 달</Button>
                <b>{value.format('YYYY년 M월')}</b>
                <Button onClick={() => onChange(value.add(1, 'month'))}>다음 달 ›</Button>
              </div>
            )}
            // 칸에는 합계만 — 주문이 수십 건이어도 모양이 같다 (자세한 건 눌러서)
            cellRender={(d: Dayjs, info) => {
              if (info.type !== 'date') return info.originNode
              const date = d.format('YYYY-MM-DD')
              const rows = items.get(date) ?? []
              if (rows.length === 0) return null
              const sum = daySummary(rows)
              return (
                <div className="dw-stl-cell" data-tour={date === busy ? 'stl-busy' : undefined}>
                  {sum.inflowCount > 0 && (
                    <div className={`dw-stl-chip dw-stl-${sum.inflowStage}`}>
                      +{koreanWon(sum.inflow)}
                      {sum.inflowCount > 1 && <small> ({sum.inflowCount}건)</small>}
                    </div>
                  )}
                  {sum.outflowCount > 0 && (
                    <div className="dw-stl-chip dw-stl-OUTFLOW" data-tour="stl-outflow">
                      −{koreanWon(sum.outflow)}
                    </div>
                  )}
                </div>
              )
            }}
          />
        </Card>
        <Card
          className="dw-stl-day"
          title={`${monthDay(selected)}${selected === today ? ' · 오늘' : ''}`}
        >
          {dayRows.length === 0 && (
            <p className="dw-muted">이날은 들어오거나 나가는 돈이 없어요.</p>
          )}
          {day.inflowCount > 0 && (
            <div className="dw-stl-daysum">
              <div>
                들어올 돈 <b className="dw-stl-in">+{koreanWon(day.inflow)}</b> · {day.inflowCount}
                건
              </div>
              {(['COMPLETED', 'SCHEDULED', 'EXPECTED'] as const)
                .filter((st) => day.byStage[st].count > 0)
                .map((st) => (
                  <div key={st} className="dw-muted dw-small">
                    <span className={`dw-stl-chip dw-stl-${st}`}>{STAGE_VIEW[st].label}</span>{' '}
                    {day.byStage[st].count}건 · +{koreanWon(day.byStage[st].amount)}
                    {st === 'EXPECTED' && ' (픽업 전 · 늦어질 수 있음)'}
                  </div>
                ))}
            </div>
          )}
          {preview.map((r) => (
            <div key={r.key} className="dw-stl-row">
              <div>
                <span className={`dw-stl-chip dw-stl-${r.stage}`}>{STAGE_VIEW[r.stage].label}</span>
                <b className="dw-stl-row-title">{r.title}</b>
                <div className="dw-muted dw-small">{r.sub}</div>
              </div>
              <b className={r.stage === 'OUTFLOW' ? 'dw-stl-out' : 'dw-stl-in'}>
                {r.stage === 'OUTFLOW' ? '−' : '+'}
                {koreanWon(r.amount)}
              </b>
            </div>
          ))}
          {day.inflowCount > DAY_PREVIEW && (
            <Button block className="dw-stl-more" onClick={() => setListOpen(true)}>
              {dayRows.length}건 모두 보기
            </Button>
          )}
          {dayRows.length > 0 && (
            <RawDetails
              title="원본 값"
              rows={dayRows.map((r) => [
                r.stage === 'OUTFLOW' ? `출금 ${r.title}` : `정산 ${r.title}`,
                `번호 ${r.rawId}`,
              ])}
            />
          )}
        </Card>
      </div>
      <Drawer
        open={listOpen}
        onClose={() => setListOpen(false)}
        width={760}
        title={`${monthDay(selected)} 정산 · 출금 목록`}
        extra={
          <Button onClick={() => navigate(`/owner/settlements/${selected}`)}>
            전체 페이지로 보기 ↗
          </Button>
        }
        destroyOnHidden
      >
        <SettlementDayList rows={dayRows} />
      </Drawer>
    </>
  )
}
