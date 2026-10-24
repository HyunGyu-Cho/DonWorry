import type { ReactNode } from 'react'
import { CompareBadge, type CompareKind } from './CompareBadge'

interface FactLineProps {
  // 무엇에 대한 사실인지 (카드 · 기기 · 접속 위치 · 금액)
  label: string
  // 쉬운 문장 ("끝자리 1173 카드 · 이 고객이 처음 쓴 카드")
  children: ReactNode
  compare?: CompareKind
}

// 사실 한 줄: 이름 · 쉬운 문장 · 평소와 비교 배지
export function FactLine({ label, children, compare }: FactLineProps) {
  return (
    <div className="dw-fact">
      <span className="dw-fact-label">{label}</span>
      <span className="dw-fact-text">{children}</span>
      {compare && <CompareBadge kind={compare} />}
    </div>
  )
}
