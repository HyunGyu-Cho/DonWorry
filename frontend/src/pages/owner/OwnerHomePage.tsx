import { Alert, Button, Tag } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getNotifications, getOwnerResults } from '../../api/payment'
import { getFundForecast, getSettlements } from '../../api/settlement'
import { useAuth } from '../../auth/useAuth'
import { HomeFrame } from '../../components/home/HomeFrame'
import { HomeList, HomeRow, HomeTile } from '../../components/home/HomeParts'
import { useLoad } from '../../components/home/useLoad'
import { kstDate } from '../../config/settlement'
import { MAIL_KIND, OWNER_RESULT, OWNER_RESULT_ORDER, ownerCounts } from '../../utils/buyerOwner'
import { latest, nextSettlement } from '../../utils/homeView'
import { koreanWon, relativeTime } from '../../utils/humanize'
import { daysUntil, monthDay, shortageText } from '../../utils/settlementView'

// 권한이 없는 메뉴의 데이터는 부르지 않는다 (보안 확인 FDS_VIEW · 자금 FINANCE_VIEW)
async function fetchHome(fds: boolean, finance: boolean, today: string) {
  const until = dayjs(today).add(14, 'day').format('YYYY-MM-DD')
  const [results, mails, forecast, settlements] = await Promise.all([
    fds ? getOwnerResults() : Promise.resolve(null),
    getNotifications({ recipientType: 'OWNER' }),
    // 정산 API가 아직 없거나 실패해도 결제 · 메일 칸은 보여 준다 (정산 칸만 숨김)
    finance ? getFundForecast().catch(() => null) : Promise.resolve(null),
    finance ? getSettlements(today, until).catch(() => null) : Promise.resolve(null),
  ])
  return { results, mails, forecast, settlements }
}

// 사장님 홈 — 만들면 안 되는 주문 · 다음 정산 · 자금 경고 · 최근 메일
export function OwnerHomePage() {
  const { user } = useAuth()
  const fds = user?.permissions.includes('FDS_VIEW') ?? false
  const finance = user?.permissions.includes('FINANCE_VIEW') ?? false
  const [now] = useState(() => new Date())
  const today = kstDate(now)
  const { value, retry } = useLoad(() => fetchHome(fds, finance, today), `${fds}:${finance}`)
  const state = value === null ? 'loading' : value === 'error' ? 'error' : 'ready'
  return (
    <HomeFrame
      title="홈"
      description="우리 가게 결제와 정산을 한눈에 보여 드려요. 칸을 누르면 자세한 화면으로 가요."
      state={state}
      onRetry={retry}
    >
      {value && value !== 'error' && <OwnerHomeBody data={value} now={now} today={today} />}
    </HomeFrame>
  )
}

function OwnerHomeBody(props: {
  data: Awaited<ReturnType<typeof fetchHome>>
  now: Date
  today: string
}) {
  const { data, now, today } = props
  const { results, mails, forecast, settlements } = data
  const counts = results ? ownerCounts(results) : null
  const next = settlements ? nextSettlement(settlements, today) : null
  const warning = forecast ? shortageText(forecast, today) : null

  return (
    <>
      {counts && counts.CHECKING > 0 && (
        <Alert
          className="dw-fund-alert"
          type="info"
          showIcon
          message={
            <b>돈워리가 검토 중인 결제 {counts.CHECKING}건 · 주문은 그대로 진행하셔도 돼요</b>
          }
          description="카드 승인이 끝난 결제예요. 검토 끝에 사기로 드러나도 손해는 돈워리가 부담해요. 결과는 메일로도 알려 드려요."
          action={
            <Link to="/owner/results">
              <Button data-tour="home-checking">주문 보기</Button>
            </Link>
          }
        />
      )}
      <div className="dw-home-tiles">
        {settlements && (
          <HomeTile
            to="/owner/settlements"
            label="다음 정산"
            value={next ? `+${koreanWon(next.amount)}` : '없음'}
            note={
              next
                ? `${daysUntil(next.date, today) === 0 ? '오늘' : `${monthDay(next.date)}`} · 주문 ${next.count}건${next.unconfirmed ? ' · 픽업 후 확정' : ''}`
                : '앞으로 14일 동안 정산 예정이 없어요'
            }
            tone="ok"
          />
        )}
        {forecast && (
          <HomeTile
            to="/owner/funds"
            label="자금"
            value={warning ? `${koreanWon(forecast.neededAmount)} 필요` : '괜찮아요'}
            note={warning ?? '앞으로 14일 동안 잔액이 모자라는 날이 없어요'}
            tone={warning ? 'bad' : 'ok'}
          />
        )}
        {counts && (
          <HomeTile
            to="/owner/results"
            label="보안 확인 결과"
            value={`검토 중 ${counts.CHECKING}건`}
            note={OWNER_RESULT_ORDER.filter((k) => k !== 'CHECKING')
              .map((k) => `${OWNER_RESULT[k].label} ${counts[k]}`)
              .join(' · ')}
            tone={counts.CHECKING > 0 ? 'warn' : 'ok'}
          />
        )}
      </div>
      <div className="dw-home-grid">
        <HomeList title="최근 받은 메일" empty="받은 메일이 없어요.">
          {latest(mails, (m) => m.createdAt, 4).map((m) => (
            <HomeRow
              key={m.notificationId}
              title={
                <>
                  <Tag color={MAIL_KIND[m.kind].color}>{MAIL_KIND[m.kind].label}</Tag>
                  {m.subject}
                </>
              }
              side={relativeTime(m.createdAt, now)}
            />
          ))}
        </HomeList>
      </div>
    </>
  )
}
