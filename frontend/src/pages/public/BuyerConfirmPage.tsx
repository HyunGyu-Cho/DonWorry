import { Button, Result, Spin } from 'antd'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { answerBuyerConfirm, getBuyerConfirmRequest } from '../../api/payment'
import { ConfirmAlreadyAnsweredError, ConfirmLinkExpiredError } from '../../api/paymentErrors'
import type { BuyerAnswer, BuyerConfirmRequest } from '../../types/payment'
import { koreanWon, relativeTime } from '../../utils/humanize'
import { linkExpiresText } from '../../utils/buyerOwner'

type Loaded = BuyerConfirmRequest | 'expired' | 'error'

async function fetchRequest(token: string): Promise<Loaded> {
  try {
    return await getBuyerConfirmRequest(token)
  } catch (e) {
    return e instanceof ConfirmLinkExpiredError ? 'expired' : 'error'
  }
}

// 답한 뒤 안내 — 왜 확인했는지 · 점수는 쓰지 않는다 (공격자에게 피하는 법을 알려 주지 않게)
const THANKS: Record<BuyerAnswer, { title: string; text: string }> = {
  MINE: {
    title: '확인해 주셔서 고마워요',
    text: '본인 결제로 알려 주셨어요. 확인이 끝나면 결제가 마무리되고 메일로 알려 드릴게요.',
  },
  NOT_MINE: {
    title: '알려 주셔서 고마워요',
    text: '보안팀이 확인하고 결과를 메일로 알려 드릴게요. 카드를 잃어버렸거나 도용이 의심되면 카드사에도 연락해 주세요.',
  },
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="dw-public">
      <header className="dw-public-head">
        <b>돈워리</b> <span>결제 확인</span>
      </header>
      <main className="dw-public-card">{children}</main>
      <footer className="dw-public-foot">
        돈워리는 가맹점의 결제를 안전하게 처리하는 서비스예요. 이 페이지는 로그인 없이 메일 속
        링크로만 열려요.
      </footer>
    </div>
  )
}

// 구매자 본인 확인 — 로그인 없이 메일 속 1회용 링크로 들어온다 (/confirm/:token)
export function BuyerConfirmPage() {
  const { token = '' } = useParams()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [answered, setAnswered] = useState<BuyerAnswer | null>(null)
  const [busy, setBusy] = useState<BuyerAnswer | null>(null)
  const [failed, setFailed] = useState(false)
  const [now] = useState(() => new Date())

  const apply = useCallback((result: Loaded) => {
    setLoaded(result)
    if (typeof result === 'object') setAnswered(result.answered)
  }, [])

  useEffect(() => {
    let alive = true
    void fetchRequest(token).then((result) => {
      if (alive) apply(result)
    })
    return () => {
      alive = false
    }
  }, [token, apply])

  const answer = async (value: BuyerAnswer) => {
    setBusy(value)
    setFailed(false)
    try {
      await answerBuyerConfirm(token, value)
      setAnswered(value)
    } catch (e) {
      if (e instanceof ConfirmAlreadyAnsweredError) {
        setLoaded(await fetchRequest(token))
      } else if (e instanceof ConfirmLinkExpiredError) {
        setLoaded('expired')
      } else {
        setFailed(true)
      }
    } finally {
      setBusy(null)
    }
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
          title={loaded === 'expired' ? '링크가 만료됐어요' : '확인 요청을 불러오지 못했어요'}
          subTitle={
            loaded === 'expired'
              ? '확인 기한이 지났어요. 결제에 대해 궁금한 점은 주문한 가게에 문의해 주세요.'
              : '잠시 후 메일 속 링크를 다시 눌러 주세요.'
          }
        />
      </Shell>
    )
  }

  if (answered) {
    const fresh = loaded.answered === null
    return (
      <Shell>
        <Result
          status="success"
          title={fresh ? THANKS[answered].title : '이미 답해 주셨어요'}
          subTitle={
            fresh
              ? THANKS[answered].text
              : `${answered === 'MINE' ? '"제가 결제했어요"' : '"결제하지 않았어요"'}로 답해 주셨어요. 답은 한 번만 할 수 있어요.`
          }
        />
      </Shell>
    )
  }

  return (
    <Shell>
      <p className="dw-public-lead">{loaded.merchantName}에서 결제가 있었어요</p>
      <div className="dw-public-order">
        <b>{loaded.orderTitle ?? '주문 상품'}</b>
        <span className="dw-public-amount">{koreanWon(loaded.amount)}</span>
        <span className="dw-muted">{relativeTime(loaded.paidAt, now)}</span>
      </div>
      <h1 className="dw-public-question">본인이 결제하셨나요?</h1>
      <div className="dw-public-actions">
        <Button
          type="primary"
          size="large"
          loading={busy === 'MINE'}
          disabled={busy !== null}
          onClick={() => void answer('MINE')}
        >
          네, 제가 결제했어요
        </Button>
        <Button
          danger
          size="large"
          loading={busy === 'NOT_MINE'}
          disabled={busy !== null}
          onClick={() => void answer('NOT_MINE')}
        >
          아니요, 결제하지 않았어요
        </Button>
      </div>
      {failed && <p className="dw-public-error">답을 보내지 못했어요. 잠시 후 다시 눌러 주세요.</p>}
      <p className="dw-muted dw-small">{linkExpiresText(loaded.expiresAt, now)}</p>
    </Shell>
  )
}
