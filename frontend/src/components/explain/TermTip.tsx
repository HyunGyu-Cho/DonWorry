import { Tooltip } from 'antd'
import type { ReactNode } from 'react'
import { GLOSSARY, type GlossaryKey } from '../../config/glossary'

// 낯선 용어에 점선 밑줄 + 풀이 툴팁. 풀이는 config/glossary.ts 한 곳에서만
export function TermTip({ term, children }: { term: GlossaryKey; children?: ReactNode }) {
  const entry = GLOSSARY[term]
  return (
    <Tooltip title={entry.text}>
      <span className="dw-term" tabIndex={0}>
        {children ?? entry.term}
      </span>
    </Tooltip>
  )
}
