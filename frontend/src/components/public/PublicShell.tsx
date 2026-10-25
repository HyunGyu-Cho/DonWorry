import type { ReactNode } from 'react'

// 로그인 없이 여는 공개 화면의 틀 (구매자 본인 확인 · 결제창 · 테스트 상점)
export function PublicShell(props: {
  title: string
  foot: string
  wide?: boolean
  children: ReactNode
}) {
  const { title, foot, wide, children } = props
  return (
    <div className={`dw-public${wide ? ' dw-public--wide' : ''}`}>
      <header className="dw-public-head">
        <b>돈워리</b> <span>{title}</span>
      </header>
      <main className="dw-public-card">{children}</main>
      <footer className="dw-public-foot">{foot}</footer>
    </div>
  )
}
