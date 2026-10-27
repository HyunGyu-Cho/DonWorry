import { Alert, Button, Radio, Result, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { createTestOrder, getTestProducts } from '../../api/checkout'
import { PublicShell } from '../../components/public/PublicShell'
import { DEFAULT_DEMO_ENVIRONMENT, DEMO_ENVIRONMENTS } from '../../config/demoEnvironments'
import { RawDetails } from '../../components/explain/RawDetails'
import type { TestProduct } from '../../types/checkout'
import { CARD_GUIDE } from '../../utils/checkoutView'
import { chosenDemoEnvironment, saveDemoEnvironment } from '../../utils/demoEnvironment'
import { koreanWon } from '../../utils/humanize'

const FOOT = '시연용 테스트 상점이에요. 실제 주문 · 결제는 일어나지 않아요.'

async function fetchProducts(): Promise<TestProduct[] | null> {
  try {
    return await getTestProducts()
  } catch {
    return null
  }
}

// 시연용 테스트 상점 — CakeShop 없이 "상품 고르기 → 돈워리 결제창 → 돌아오기"를 해 본다 (/demo/shop)
export function TestShopPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<TestProduct[] | null | 'error'>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [environment, setEnvironment] = useState(
    () => (chosenDemoEnvironment() ?? DEFAULT_DEMO_ENVIRONMENT).id,
  )

  useEffect(() => {
    let alive = true
    void fetchProducts().then((rows) => {
      if (alive) setProducts(rows ?? 'error')
    })
    return () => {
      alive = false
    }
  }, [])

  const order = async (productId: string) => {
    setBusy(productId)
    setFailed(false)
    // 결제창이 이 접속 환경으로 결제한다
    saveDemoEnvironment(environment)
    try {
      const { sessionToken } = await createTestOrder(productId)
      navigate(`/checkout/${encodeURIComponent(sessionToken)}`)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <PublicShell title="테스트 상점" foot={FOOT} wide>
      <p className="dw-public-lead">
        케이크를 골라 [결제하기]를 누르면 돈워리 결제창으로 넘어가요. 상점이 실제 가게(CakeShop)라고
        생각하고 눌러 보세요.
      </p>
      <div className="dw-shop-environment">
        <b>접속 환경</b>
        <span className="dw-muted dw-small">
          어디서 · 어떤 기기로 결제한 것처럼 보낼지 골라요 (시연 설정이 켜진 서버에서만 적용)
        </span>
        <Radio.Group
          value={environment}
          onChange={(e) => setEnvironment(String(e.target.value))}
          options={DEMO_ENVIRONMENTS.map((env) => ({
            value: env.id,
            label: (
              <span>
                {env.label} <span className="dw-muted dw-small">· {env.description}</span>
              </span>
            ),
          }))}
        />
      </div>
      {products === null && (
        <div className="dw-error-view" role="status">
          <Spin size="large" />
        </div>
      )}
      {products === 'error' && (
        <Alert
          type="warning"
          showIcon
          message="상품을 불러오지 못했어요"
          description="테스트 상점은 시연 모드에서만 열려요."
        />
      )}
      {Array.isArray(products) && (
        <div className="dw-shop-items">
          {products.map((p) => (
            <div key={p.productId} className="dw-shop-item">
              <div className="dw-shop-thumb" aria-hidden>
                🎂
              </div>
              <b>{p.title}</b>
              <span className="dw-public-amount">{koreanWon(p.amount)}</span>
              <span className="dw-muted dw-small">{p.note}</span>
              <Button
                type="primary"
                block
                loading={busy === p.productId}
                disabled={busy !== null}
                onClick={() => void order(p.productId)}
              >
                결제하기
              </Button>
            </div>
          ))}
        </div>
      )}
      {failed && <p className="dw-public-error">주문을 만들지 못했어요. 다시 눌러 주세요.</p>}
      <div className="dw-shop-guide">
        <b>시연 안내 · 카드마다 이런 결과가 나와요</b>
        <ul>
          {CARD_GUIDE.map((g) => (
            <li key={g.label}>
              <span>{g.label}</span> → {g.result}
            </li>
          ))}
        </ul>
        <span className="dw-muted dw-small">
          시간이 지난 결제창은 <Link to="/checkout/demo-session-old">여기</Link>서 열어 볼 수
          있어요.
        </span>
      </div>
    </PublicShell>
  )
}

// 결제창에서 돌아온 화면 — 돌아온 주소는 화면 이동용일 뿐, 주문 상태는 돈워리의 결과 통지로 바꾼다
export function TestShopResultPage() {
  const [params] = useSearchParams()
  const orderRef = params.get('orderRef') ?? '—'
  const paymentId = params.get('paymentId') ?? '—'
  return (
    <PublicShell title="테스트 상점" foot={FOOT}>
      <Result
        status="info"
        title="상점으로 돌아왔어요"
        subTitle="실제 가게는 이 화면만 보고 주문을 확정하지 않아요. 돈워리가 가게 서버에 결과를 따로 알려 주면 그때 주문 상태가 바뀌어요."
        extra={
          <Link to="/demo/shop">
            <Button type="primary">다른 카드로 다시 해 보기</Button>
          </Link>
        }
      />
      <RawDetails
        title="돌아온 주소에 담긴 값"
        rows={[
          ['주문번호', orderRef],
          ['결제 번호', paymentId],
        ]}
      />
    </PublicShell>
  )
}
