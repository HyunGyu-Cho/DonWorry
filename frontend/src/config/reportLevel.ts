// AI 보고서 위험도 숫자 → 말 (FDS 점수 구간 40 · 70과 같은 기준, config/fdsRules.ts)
import type { RiskLevel } from '../types/report.ts'

export const RISK_LEVELS: { level: RiskLevel; min: number; label: string }[] = [
  { level: 'HIGH', min: 70, label: '높음' },
  { level: 'MEDIUM', min: 40, label: '중간' },
  { level: 'CAUTION', min: 0, label: '주의' },
]

export function riskLevel(score: number): RiskLevel {
  return (RISK_LEVELS.find((band) => score >= band.min) ?? RISK_LEVELS[RISK_LEVELS.length - 1])
    .level
}

export const riskLevelLabel = (score: number) =>
  RISK_LEVELS.find((band) => band.level === riskLevel(score))!.label
