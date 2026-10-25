// AI 보고서 · 조사 과정 화면(1-7)의 계산 — React 없이 순수 함수만 (node 테스트가 직접 불러온다)
import type {
  ConclusionReport,
  ReportRun,
  ReportStep,
  ReportStepKind,
  SimilarCase,
  SimilarMatch,
} from '../types/report.ts'

export const STEP_ICON: Record<ReportStepKind, string> = {
  REQUEST: '📨',
  TOOL: '🔧',
  LLM: '🧠',
  LLM_FAILED: '⚠️',
  VALIDATE: '✔️',
  SAVE: '💾',
}

// 진행 중인 단계 옆 꼬리표
export function runningText(kind: ReportStepKind): string {
  if (kind === 'TOOL') return '호출 중'
  if (kind === 'LLM' || kind === 'LLM_FAILED') return '생각하는 중'
  return '진행 중'
}

export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}초`

export type TraceSummary = { totalMs: number; toolCalls: number; retries: number; maxMs: number }

export function traceSummary(steps: ReportStep[]): TraceSummary {
  const done = steps.map((s) => s.durationMs ?? 0)
  return {
    totalMs: done.reduce((a, b) => a + b, 0),
    toolCalls: steps.filter((s) => s.kind === 'TOOL').length,
    retries: steps.filter((s) => s.kind === 'LLM_FAILED').length,
    maxMs: Math.max(1, ...done),
  }
}

// 단계마다 시작 시각 (조사 시작부터 몇 ms 뒤)
export function stepStarts(steps: ReportStep[]): number[] {
  const starts: number[] = []
  let at = 0
  for (const s of steps) {
    starts.push(at)
    at += s.durationMs ?? 0
  }
  return starts
}

export const MATCH_LABEL: Record<SimilarMatch, string> = {
  SAME_CARD: '같은 카드',
  SAME_DEVICE: '같은 기기',
  SAME_IP: '같은 접속 위치',
  SAME_EMAIL: '같은 이메일',
  SAME_CUSTOMER: '같은 고객',
  SAME_STAFF: '같은 직원 계정',
  RULE_COMBO: '비슷한 Rule 조합',
}

// "2건 중 1건이 사기로 끝났어요. 같은 대상이 겹친 사건은 사기였어요."
export function similarSummary(list: SimilarCase[]): string {
  if (list.length === 0) {
    return '비슷한 과거 사건이 없어요. 처음 보는 유형이라 근거를 더 꼼꼼히 확인하세요.'
  }
  const fraud = list.filter((s) => s.outcome === 'FRAUD').length
  const strong = list.filter((s) => s.strength === 'STRONG')
  let text = `${list.length}건 중 ${fraud}건이 사기로 끝났어요.`
  if (strong.length > 0) {
    text += strong.some((s) => s.outcome === 'FRAUD')
      ? ' 같은 대상이 겹친 사건이 사기였어요.'
      : ' 같은 대상이 겹친 사건은 정상이었어요.'
  }
  return text
}

// 보고서 화면에 무엇을 보여 줄지
// NOT_READY = 조사 중이고 보고서가 아직 없음 → 사건 화면으로 안내
// RERUNNING = 이전 보고서는 있고 새 버전을 조사 중 → 이전 보고서 + 안내 띠
export type ReportPageState = 'NOT_READY' | 'RERUNNING' | 'READY' | 'NONE'

export function reportPageState(
  report: ConclusionReport | null,
  run: ReportRun | null,
): ReportPageState {
  const running = run?.status === 'RUNNING'
  if (!report) return running ? 'NOT_READY' : 'NONE'
  return running && run.reportVersion > report.reportVersion ? 'RERUNNING' : 'READY'
}
