export type CompareKind = 'SAME' | 'NEW' | 'BLOCKED'

const BADGE: Record<CompareKind, [string, string]> = {
  SAME: ['✅ 평소와 같음', 'dw-cmp-same'],
  NEW: ['⚠ 처음 봄', 'dw-cmp-new'],
  BLOCKED: ['🔴 차단 목록', 'dw-cmp-blocked'],
}

// 값 옆 "평소와 비교" 배지
export function CompareBadge({ kind }: { kind: CompareKind }) {
  const [label, className] = BADGE[kind]
  return <span className={`dw-cmp ${className}`}>{label}</span>
}
