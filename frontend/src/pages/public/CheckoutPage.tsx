import { Button, Result, Spin } from 'antd'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCheckoutSession, getDemoCards, payCheckout } from '../../api/checkout'
import { CheckoutAlreadyPaidError, CheckoutExpiredError } from '../../api/checkoutErrors'
import { PublicShell } from '../../components/public/PublicShell'
import type { CheckoutResult, CheckoutSession, DemoCard } from '../../types/checkout'
import {
  cardCountryText,
  checkoutExpiresText,
  OUTCOME_VIEW,
  returnTarget,
} from '../../utils/checkoutView'
import { koreanWon } from '../../utils/humanize'

type Loaded = { session: CheckoutSession; cards: DemoCard[] } | 'expired' | 'error'

async function fetchCheckout(token: string): Promise<Loaded> {
  try {
    const [session, cards] = await Promise.all([getCheckoutSession(token), getDemoCards()])
    return { session, cards }
  } catch (e) {
    return e instanceof CheckoutExpiredError ? 'expired' : 'error'
  }
}

const FOOT =
  '돈워리는 가맹점의 결제를 안전하게 처리하는 서비스예요. 카드 정보는 가게에 전달되지 않아요.'

function Shell({ children }: { children: ReactNode }) {
  return (
    <PublicShell title="안전 결제" foot={FOOT}>
      {children}
    </PublicShell>
  )
}

// 돈워리 결제창 — 구매자가 상점에서 넘어와 카드를 고르고 결제한다 (/checkout/:token)
export function CheckoutPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [cardToken, setCardToken] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [result, setResult] = useState<CheckoutResult | null>(null)
  const [now] = useState(() => new Date())

  const apply = useCallback((value: Loaded) => setLoaded(value), [])
  useEffect(() => {
    let alive = true
    void fetchCheckout(token).then((value) => {
      if (alive) apply(value)
    })
    return () => {
      alive = false
    }
  }, [token, apply])

  const pay = async () => {
    if (!cardToken || paying) return
    setPaying(true)
    setFailed(false)
    try {
      setResult(await payCheckout(token, cardToken))
    } catch (e) {
      if (e instanceof CheckoutAlreadyPaidError) setLoaded(await fetchCheckout(token))
      else if (e instanceof CheckoutExpiredError) setLoaded('expired')
      else setFailed(true)
    } finally {
      setPaying(false)
    }
  }

  const goBack = (url: string) => {
    const target = returnTarget(url)
    if (target.internal) navigate(target.to)
    else window.location.assign(target.to)
  }

  if (loaded === null) {
    return (
      <Shell>
        <div className="dw-error-view" role="status">
          <Spin size="large" />
        </div>
      </Shell>
    )
  }
  if (loaded === 'expired' || loaded === 'error') {
    return (
      <Shell>
        <Result
          status={loaded === 'expired' ? 'info' : 'warning'}
          title={loaded === 'expired' ? '결제 시간이 지났어요' : '결제창을 불러오지 못했어요'}
          subTitle={
            loaded === 'expired'
              ? '카드에 청구되지 않았어요. 상점에서 다시 주문해 주세요.'
              : '잠시 후 다시 열어 주세요. 카드에 청구되지 않았어요.'
          }
        />
      </Shell>
    )
  }

  if (result) {
    const view = OUTCOME_VIEW[result.outcome]
    return (
      <Shell>
        <Result
          status={view.status}
          title={result.title}
          subTitle={
            <>
              <b className="dw-checkout-charge">{view.charge}</b>
              <span>{result.message}</span>
            </>
          }
          extra={
            <Button type="primary" size="large" onClick={() => goBack(result.returnUrl)}>
              상점으로 돌아가기
            </Button>
          }
        />
      </Shell>
    )
  }

  const { session, cards } = loaded
  if (session.status === 'PAID') {
    return (
      <Shell>
        <Result
          status="info"
          title="이미 결제가 진행된 주문이에요"
          subTitle="같은 주문을 두 번 결제하지 않도록 막았어요. 결과는 상점 주문 내역과 메일에서 확인해 주세요."
        />
      </Shell>
    )
  }

  if (paying) {
    return (
      <Shell>
        <div className="dw-checkout-paying" role="status">
          <Spin size="large" />
          <b>결제를 처리하고 있어요</b>
          <span className="dw-muted">창을 닫거나 새로 고치지 말아 주세요.</span>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <p className="dw-public-lead">{session.merchantName} 결제</p>
      <div className="dw-public-order">
        <b>{session.orderTitle}</b>
        <span className="dw-public-amount">{koreanWon(session.amount)}</span>
        <span className="dw-muted dw-small">
          {session.buyerName} · {session.buyerEmailMasked}
        </span>
      </div>
      <h1 className="dw-public-question">결제할 카드를 골라 주세요</h1>
      <div className="dw-checkout-cards" role="radiogroup" aria-label="결제 카드">
        {cards.map((c) => (
          <button
            key={c.cardToken}
            type="button"
            role="radio"
            aria-checked={cardToken === c.cardToken}
            className={`dw-checkout-card${cardToken === c.cardToken ? ' is-selected' : ''}`}
            onClick={() => setCardToken(c.cardToken)}
          >
            <b>{c.label}</b>
            <span className="dw-muted dw-small">
              {c.masked} · {cardCountryText(c.country)}
            </span>
          </button>
        ))}
      </div>
      <Button type="primary" size="large" block disabled={!cardToken} onClick={() => void pay()}>
        {koreanWon(session.amount)} 결제하기
      </Button>
      {failed && (
        <p className="dw-public-error">
          결제를 보내지 못했어요. 카드에 청구되지 않았어요. 잠시 후 다시 눌러 주세요.
        </p>
      )}
      <p className="dw-muted dw-small dw-checkout-foot">
        시연용 모의 카드예요. 실제 결제창에서는 카드 정보를 입력해요. ·{' '}
        {checkoutExpiresText(session.expiresAt, now)}
      </p>
    </Shell>
  )
}
