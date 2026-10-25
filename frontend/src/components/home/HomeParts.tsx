import { Card } from 'antd'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export type TileTone = 'bad' | 'warn' | 'ok' | 'muted'

// 오늘 처리할 일 한 칸 — 누르면 해당 화면으로
export function HomeTile(props: {
  to: string
  label: string
  value: ReactNode
  note: ReactNode
  tone: TileTone
}) {
  const { to, label, value, note, tone } = props
  return (
    <Link to={to} className={`dw-home-tile dw-home-tile--${tone}`}>
      <span className="dw-home-tile-label">{label}</span>
      <b className="dw-home-tile-value">{value}</b>
      <span className="dw-home-tile-note">{note}</span>
      <span className="dw-home-tile-go" aria-hidden>
        →
      </span>
    </Link>
  )
}

// 홈 아래쪽 목록 카드 — 비었을 때 문장을 함께 받는다
export function HomeList(props: {
  title: string
  more?: { to: string; label: string }
  empty: string
  children: ReactNode[]
}) {
  const { title, more, empty, children } = props
  return (
    <Card
      title={title}
      className="dw-home-list"
      extra={more && <Link to={more.to}>{more.label} →</Link>}
    >
      {children.length === 0 ? <p className="dw-muted">{empty}</p> : children}
    </Card>
  )
}

export function HomeRow(props: {
  to?: string
  title: ReactNode
  sub?: ReactNode
  side?: ReactNode
}) {
  const { to, title, sub, side } = props
  const inner = (
    <>
      <div>
        <div className="dw-home-row-title">{title}</div>
        {sub && <div className="dw-muted dw-small">{sub}</div>}
      </div>
      {side && <div className="dw-home-row-side">{side}</div>}
    </>
  )
  return to ? (
    <Link to={to} className="dw-home-row is-link">
      {inner}
    </Link>
  ) : (
    <div className="dw-home-row">{inner}</div>
  )
}
