import type { ReactNode } from 'react'

interface RawDetailsProps {
  title?: string
  // [이름, 원본 값] — IP · 기기 ID · 카드 지문 같은 값
  rows: [string, ReactNode][]
}

// 원본 값은 기본으로 접어 둔다 (화면 원칙: 원본 값은 펼치기 안에만)
export function RawDetails({ title = '원본 값 펼치기', rows }: RawDetailsProps) {
  return (
    <details className="dw-raw">
      <summary>{title}</summary>
      <dl>
        {rows.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
