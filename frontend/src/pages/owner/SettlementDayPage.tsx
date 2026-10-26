import { ArrowLeftOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getFundForecast, getSettlements } from '../../api/settlement'
import { PageHeader } from '../../components/common/PageHeader'
import { type CalendarItem, calendarItems, monthDay } from '../../utils/settlementView'
import { SettlementDayList } from './settlement/SettlementDayList'

const DATE = /^\d{4}-\d{2}-\d{2}$/

// 그날 하루치 정산 · 출금 전체 (getSettlements는 하루 범위로, 출금은 자금 예측의 예정 출금에서)
async function fetchDay(date: string): Promise<CalendarItem[] | null> {
  try {
    const [settlements, forecast] = await Promise.all([
      getSettlements(date, date),
      getFundForecast(),
    ])
    return calendarItems(settlements, forecast.transfers).get(date) ?? []
  } catch {
    return null
  }
}

// 정산 하루 목록 전체 페이지 (/owner/settlements/:date) — 캘린더 옆 목록 창의 [전체 페이지로 보기]
export function SettlementDayPage() {
  const { date = '' } = useParams()
  const navigate = useNavigate()
  const valid = DATE.test(date)
  const [rows, setRows] = useState<CalendarItem[] | null | 'error'>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!valid) return
    let alive = true
    void fetchDay(date).then((result) => {
      if (alive) setRows(result ?? 'error')
    })
    return () => {
      alive = false
    }
  }, [date, valid, retry])

  const back = (
    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/owner/settlements')}>
      캘린더로
    </Button>
  )
  const header = (
    <PageHeader
      title={valid ? `${monthDay(date)} 정산 · 출금 목록` : '정산 목록'}
      description="그날 들어오는 정산과 나가는 돈을 모두 보여 드려요. 받는 돈은 결제 금액에서 수수료를 뺀 금액이에요."
      actions={back}
    />
  )
  if (!valid) {
    return (
      <>
        {header}
        <Alert type="warning" showIcon message="날짜 주소가 올바르지 않아요." />
      </>
    )
  }
  if (rows === 'error') {
    return (
      <>
        {header}
        <Alert
          type="warning"
          showIcon
          message="정산 목록을 불러오지 못했습니다."
          action={<Button onClick={() => setRetry((n) => n + 1)}>다시 시도</Button>}
        />
      </>
    )
  }
  return (
    <>
      {header}
      <Card>
        {rows === null ? (
          <div className="dw-error-view" role="status">
            <Spin size="large" />
          </div>
        ) : (
          <SettlementDayList rows={rows} />
        )}
      </Card>
    </>
  )
}
