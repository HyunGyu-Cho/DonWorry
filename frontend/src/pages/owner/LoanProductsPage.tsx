import { Alert, Button, Card, Spin, Tag } from 'antd'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getFundForecast, getLoanProducts } from '../../api/settlement'
import { PageHeader } from '../../components/common/PageHeader'
import type { LoanProduct } from '../../types/settlement'
import { koreanWon } from '../../utils/humanize'
import { coversNeed, rateText, sortLoans, termText } from '../../utils/settlementView'

type Data = { products: LoanProduct[]; needed: number | null }

// 필요 금액은 자금 현황 기준 — 못 가져와도 상품 목록은 보여 준다
async function fetchLoans(): Promise<Data | null> {
  try {
    const [products, forecast] = await Promise.all([
      getLoanProducts(),
      getFundForecast().catch(() => null),
    ])
    return { products, needed: forecast ? forecast.neededAmount : null }
  } catch {
    return null
  }
}

// 연계 대출 상품 — 조회만, 신청은 각 은행에서
export function LoanProductsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let alive = true
    void fetchLoans().then((result) => {
      if (!alive) return
      setData(result)
      setError(!result)
    })
    return () => {
      alive = false
    }
  }, [retry])

  const header = (
    <PageHeader
      title="연계 대출 상품"
      description="잔액이 모자랄 때 알아볼 수 있는 은행 상품이에요. 돈워리는 상품을 소개만 하고, 신청은 각 은행에서 해요."
    />
  )
  if (error) {
    return (
      <>
        {header}
        <Alert
          type="warning"
          showIcon
          message="대출 상품을 불러오지 못했습니다."
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

  const needed = data.needed ?? 0
  return (
    <>
      {header}
      {data.needed === null ? null : needed > 0 ? (
        <Alert
          className="dw-fund-alert"
          type="info"
          showIcon
          message={`앞으로 14일 동안 ${koreanWon(needed)}이 더 필요해요`}
          description={<Link to="/owner/funds">자금 현황에서 왜 모자란지 보기</Link>}
        />
      ) : (
        <Alert
          className="dw-fund-alert"
          type="success"
          showIcon
          message="지금은 14일 동안 모자라는 날이 없어요. 참고용으로 보세요."
        />
      )}
      <div className="dw-loan-grid" data-tour="loan-list">
        {sortLoans(data.products, needed).map((p) => (
          <Card
            key={p.loanProductId}
            className={`dw-loan${p.recommended ? ' is-recommended' : ''}`}
          >
            <div className="dw-loan-tags">
              {p.recommended && <Tag color="blue">돈워리 추천</Tag>}
              {coversNeed(p, needed) && <Tag color="green">필요한 금액만큼 빌릴 수 있어요</Tag>}
            </div>
            <div className="dw-muted dw-small">{p.bankName}</div>
            <h3 className="dw-loan-name">{p.productName}</h3>
            <dl className="dw-loan-facts">
              <div>
                <dt>한도</dt>
                <dd>최대 {koreanWon(p.maxLimitAmount)}</dd>
              </div>
              <div>
                <dt>금리</dt>
                <dd>{rateText(p)}</dd>
              </div>
              <div>
                <dt>기간</dt>
                <dd>{termText(p)}</dd>
              </div>
            </dl>
            <p className="dw-loan-feature">{p.feature}</p>
          </Card>
        ))}
      </div>
      <p className="dw-muted dw-small dw-rule-note">
        금리와 한도는 은행 심사에 따라 달라요. 돈워리는 신청 정보를 받거나 은행에 넘기지 않아요.
      </p>
    </>
  )
}
