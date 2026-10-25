import { Alert, Button, Card, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getFundForecast } from '../../api/settlement'
import { PageHeader } from '../../components/common/PageHeader'
import { RawDetails } from '../../components/explain/RawDetails'
import { kstDate } from '../../config/settlement'
import type { FundForecast } from '../../types/settlement'
import { koreanWon, relativeTime } from '../../utils/humanize'
import { balanceBars, monthDay, shortageText } from '../../utils/settlementView'

async function fetchForecast(): Promise<FundForecast | null> {
  try {
    return await getFundForecast()
  } catch {
    return null
  }
}

// 사장님 자금 현황 — 앞으로 14일 동안 통장 잔액이 모자라는 날이 있는지
export function FundsPage() {
  const [forecast, setForecast] = useState<FundForecast | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [now] = useState(() => new Date())

  useEffect(() => {
    let alive = true
    void fetchForecast().then((result) => {
      if (!alive) return
      setForecast(result)
      setError(!result)
    })
    return () => {
      alive = false
    }
  }, [retry])

  const header = (
    <PageHeader
      title="자금 현황"
      description="지금 통장 잔액에 들어올 정산을 더하고 나갈 돈을 빼서, 앞으로 14일 동안의 잔액을 미리 보여 드려요."
    />
  )
  if (error) {
    return (
      <>
        {header}
        <Alert
          type="warning"
          showIcon
          message="자금 현황을 불러오지 못했습니다."
          description="은행 정보를 가져오지 못했을 수 있어요."
          action={<Button onClick={() => setRetry((n) => n + 1)}>다시 시도</Button>}
        />
      </>
    )
  }
  if (!forecast) {
    return (
      <>
        {header}
        <div className="dw-error-view" role="status">
          <Spin size="large" />
        </div>
      </>
    )
  }

  const today = kstDate(now)
  const warning = shortageText(forecast, today)
  const { zeroPct, bars } = balanceBars(forecast)
  const { causes } = forecast

  return (
    <>
      {header}
      {warning ? (
        <Alert
          className="dw-fund-alert"
          type="error"
          showIcon
          message={<b>{warning}</b>}
          description={`${koreanWon(forecast.neededAmount)}이 더 있으면 14일 동안 모자라지 않아요.`}
          action={
            <Link to="/owner/loans">
              <Button danger>대출 상품 보기</Button>
            </Link>
          }
        />
      ) : (
        <Alert
          className="dw-fund-alert"
          type="success"
          showIcon
          message="앞으로 14일 동안 잔액이 모자라는 날이 없어요."
        />
      )}
      <div className="dw-pa-stats">
        <Card className="dw-pa-stat">
          <div className="dw-muted dw-small">지금 통장 잔액 · {forecast.bank.bankName}</div>
          <div className="dw-pa-stat-value">{koreanWon(forecast.bank.balance)}</div>
          <div className="dw-muted dw-small">{relativeTime(forecast.bank.asOf, now)} 기준</div>
        </Card>
        <Card className="dw-pa-stat">
          <div className="dw-muted dw-small">14일 동안 들어올 돈</div>
          <div className="dw-pa-stat-value dw-stl-in">{koreanWon(forecast.totalInflow)}</div>
          <div className="dw-muted dw-small">정산 예정 · 예상 정산</div>
        </Card>
        <Card className="dw-pa-stat">
          <div className="dw-muted dw-small">14일 동안 나갈 돈</div>
          <div className="dw-pa-stat-value dw-stl-out">{koreanWon(forecast.totalOutflow)}</div>
          <div className="dw-muted dw-small">은행 자동이체 {forecast.transfers.length}건</div>
        </Card>
        <Card className="dw-pa-stat">
          <div className="dw-muted dw-small">가장 적을 때 잔액</div>
          <div className={`dw-pa-stat-value${forecast.minBalance < 0 ? ' dw-stl-out' : ''}`}>
            {koreanWon(forecast.minBalance)}
          </div>
          <div className="dw-muted dw-small">
            {forecast.firstShortageDate
              ? `${monthDay(forecast.firstShortageDate)}부터 모자라요`
              : '모자라는 날 없음'}
          </div>
        </Card>
      </div>
      <Card
        title="앞으로 14일 잔액"
        extra={<span className="dw-muted dw-small">막대에 마우스를 올리면 그날 금액이 보여요</span>}
      >
        <div className="dw-fund-chart" role="img" aria-label="14일 예상 잔액 막대 그래프">
          <div className="dw-fund-zero" style={{ top: `${zeroPct}%` }}>
            <span>0원</span>
          </div>
          {bars.map((b, i) => {
            const day = forecast.days[i]
            const label = `${monthDay(b.date)} · 잔액 ${koreanWon(b.balance)} · 들어옴 ${koreanWon(day.inflow)} · 나감 ${koreanWon(day.outflow)}`
            return (
              <div key={b.date} className="dw-fund-col" title={label}>
                <div
                  className={`dw-fund-bar${b.negative ? ' is-negative' : ''}`}
                  style={
                    b.negative
                      ? { top: `${zeroPct}%`, height: `${b.heightPct}%` }
                      : { bottom: `${100 - zeroPct}%`, height: `${b.heightPct}%` }
                  }
                />
                {day.outflow > 0 && <span className="dw-fund-out">−{koreanWon(day.outflow)}</span>}
              </div>
            )
          })}
        </div>
        <div className="dw-fund-days">
          {bars.map((b) => (
            <span key={b.date} className={b.date === today ? 'is-today' : ''}>
              {b.date === today ? '오늘' : Number(b.date.slice(8))}
            </span>
          ))}
        </div>
      </Card>
      <div className="dw-fund-grid">
        <Card title="왜 모자라나요?">
          <div className="dw-fund-cause">
            <b>보안 확인 중인 결제 {causes.heldPaymentCount}건</b>
            <span>{koreanWon(causes.heldAmount)}</span>
            <p className="dw-muted dw-small">
              확인이 끝날 때까지 정산 일정에 넣지 않았어요. 확인이 끝나면 다시 계산돼요.
            </p>
          </div>
          <div className="dw-fund-cause">
            <b>픽업 전이라 늦어질 수 있는 정산</b>
            <span>{koreanWon(causes.unconfirmedAmount)}</span>
            <p className="dw-muted dw-small">예측에는 넣었지만 픽업이 미뤄지면 정산도 늦어져요.</p>
          </div>
          <div className="dw-fund-cause">
            <b>큰 지출 {causes.largeTransfers.length}건</b>
            <span>{koreanWon(causes.largeTransfers.reduce((n, t) => n + t.amount, 0))}</span>
            <p className="dw-muted dw-small">
              {causes.largeTransfers.map((t) => `${monthDay(t.date)} ${t.label}`).join(' · ') ||
                '100만 원 이상 출금 없음'}
            </p>
          </div>
        </Card>
        <Card title="예정 출금">
          {forecast.transfers.map((t) => (
            <div key={t.transferId} className="dw-stl-row">
              <div>
                <b className="dw-stl-row-title">{t.label}</b>
                <div className="dw-muted dw-small">{monthDay(t.date)} · 은행 자동이체</div>
              </div>
              <b className="dw-stl-out">−{koreanWon(t.amount)}</b>
            </div>
          ))}
          <RawDetails title="원본 값" rows={[['계좌', forecast.bank.accountMasked]]} />
        </Card>
      </div>
    </>
  )
}
