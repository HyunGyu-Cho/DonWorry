import { riskLevel, riskLevelLabel } from '../../config/reportLevel'
import type { ReportRecommendation } from '../../types/report'

interface ConclusionCardProps {
  // 0~100 위험도
  score: number
  // 위에 작게: 사건 종류 · 대상
  eyebrow?: string
  verdict: string
  summary?: string
  recommendations?: ReportRecommendation[]
}

const LEVEL_COLOR = { HIGH: '#F87171', MEDIUM: '#FBBF24', CAUTION: '#60A5FA' } as const
const ICON = { POSITIVE: '✓', NEGATIVE: '■', INFO: '☎' } as const

// 화면 맨 위 결론 카드 — 위험도 게이지 + 결론 한 문장 + 권고 칩
export function ConclusionCard({
  score,
  eyebrow,
  verdict,
  summary,
  recommendations = [],
}: ConclusionCardProps) {
  const level = riskLevel(score)
  const angle = Math.max(0, Math.min(100, score)) * 1.8
  return (
    <section className="dw-conclusion" aria-label="결론">
      <div className="dw-gauge" aria-label={`위험도 ${score}점, ${riskLevelLabel(score)}`}>
        <div
          className="dw-gauge-arc"
          style={{
            background: `conic-gradient(from 270deg, ${LEVEL_COLOR[level]} 0deg ${angle}deg, rgba(255,255,255,.15) ${angle}deg 180deg, transparent 180deg)`,
          }}
        />
        <b>{score}</b>
        <span>위험도 · {riskLevelLabel(score)}</span>
      </div>
      <div className="dw-conclusion-body">
        {eyebrow && <div className="dw-conclusion-eyebrow">{eyebrow}</div>}
        <h2 className="dw-conclusion-verdict">{verdict}</h2>
        {summary && <p className="dw-conclusion-summary">{summary}</p>}
        {recommendations.length > 0 && (
          <div className="dw-conclusion-recs">
            {recommendations.map((r) => (
              <span key={r.label} className={`dw-rec dw-rec-${r.kind.toLowerCase()}`}>
                {ICON[r.kind]} {r.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
