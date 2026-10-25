import { Button } from 'antd'
import { Link } from 'react-router-dom'
import { SCENARIOS } from '../../config/scenarios'

const FEATURES = [
  {
    icon: '🛡️',
    title: '결제 사기 막기',
    text: '이상한 결제를 점수로 걸러 내고, 애매한 건 AI가 조사한 보고서를 보고 사람이 정해요.',
  },
  {
    icon: '🔐',
    title: '직원 계정 지키기',
    text: '흩어진 로그인 실패를 계정 기준으로 묶어 공격을 찾아내고, 위험한 요청은 관리자가 승인해요.',
  },
  {
    icon: '📅',
    title: '정산과 자금 미리 보기',
    text: '언제 돈이 들어오고 언제 모자라는지 14일 앞까지 보여 드리고, 필요하면 대출 상품을 알려 드려요.',
  },
]

// 랜딩 — 처음 온 사람에게 서비스를 소개하고 시연할 시나리오를 고르게 한다 (/)
export function LandingPage() {
  return (
    <div className="dw-landing">
      <header className="dw-landing-top">
        <b className="dw-landing-brand">돈워리</b>
        <Link to="/login">
          <Button>로그인 · 내 홈으로</Button>
        </Link>
      </header>
      <section className="dw-landing-hero">
        <h1>
          가게의 결제를 지키고,
          <br />
          정산 돈 걱정을 덜어 주는 결제 서비스
        </h1>
        <p>
          케이크 가게(CakeShop) 같은 가맹점의 결제를 대신 처리하면서, 사기 결제와 직원 계정 공격을
          하나의 흐름으로 잡아내요.
        </p>
        <div className="dw-landing-flow" aria-label="탐지 흐름">
          {['Rule 점수', '경보', '사건', 'AI 조사', '사람이 판정', '조치'].map((step, i) => (
            <span key={step}>
              {i > 0 && <i aria-hidden>→</i>}
              {step}
            </span>
          ))}
        </div>
      </section>
      <section className="dw-landing-features">
        {FEATURES.map((f) => (
          <div key={f.title} className="dw-landing-feature">
            <span className="dw-landing-icon" aria-hidden>
              {f.icon}
            </span>
            <b>{f.title}</b>
            <p>{f.text}</p>
          </div>
        ))}
      </section>
      <section className="dw-landing-scenarios">
        <h2>시나리오를 골라 직접 눌러 보세요</h2>
        <p className="dw-muted">
          카드를 고르면 그 역할의 시연 계정이 로그인 화면에 채워져요. 비밀번호와 인증 코드는 로그인
          화면 아래 안내를 보세요.
        </p>
        <div className="dw-landing-grid">
          {SCENARIOS.map((s) => (
            <div key={s.id} className="dw-landing-card">
              <div className="dw-landing-card-top">
                <span className="dw-landing-mark">{s.mark}</span>
                <span className="dw-muted dw-small">
                  {s.roleLabel} · 약 {s.minutes}분
                </span>
              </div>
              <b className="dw-landing-card-title">{s.title}</b>
              <p>{s.summary}</p>
              <ul>
                {s.sees.map((see) => (
                  <li key={see}>{see}</li>
                ))}
              </ul>
              <Link to={`/login?scenario=${s.id}`}>
                <Button type="primary" block>
                  이 시나리오로 시작
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>
      <footer className="dw-landing-foot">
        <Link to="/demo/shop">테스트 상점에서 결제해 보기 →</Link>
        <span className="dw-muted dw-small">
          시연용 서비스예요. 실제 결제 · 대출은 일어나지 않아요.
        </span>
      </footer>
    </div>
  )
}
