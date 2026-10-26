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
// FAILED = 조사가 최종 실패했고 보여 줄 보고서가 없음 → 직접 판정 안내 (2-17b)
// LATEST_FAILED = 최신 조사는 실패, 이전 완료 보고서는 있음 → 이전 보고서 + 실패 띠
export type ReportPageState =
  'NOT_READY' | 'RERUNNING' | 'READY' | 'NONE' | 'FAILED' | 'LATEST_FAILED'

export function reportPageState(
  report: ConclusionReport | null,
  run: ReportRun | null,
): ReportPageState {
  const running = run?.status === 'RUNNING'
  const failed = run?.status === 'FAILED'
  if (!report) return running ? 'NOT_READY' : failed ? 'FAILED' : 'NONE'
  const newer = run !== null && run.reportVersion > report.reportVersion
  if (running && newer) return 'RERUNNING'
  return failed && newer ? 'LATEST_FAILED' : 'READY'
}

// 실패 안내 문구 — 보고서 화면 · 사건 화면 "AI 조사 요약"이 같이 쓴다 (실패 이유는 보여 주지 않음)
export const REPORT_FAILED_TITLE = 'AI 조사에 실패했어요. 판정은 직접 해 주세요'
export const REPORT_FAILED_DETAIL =
  'AI가 정해진 횟수만큼 조사했지만 쓸 수 있는 보고서를 만들지 못했어요. 사건의 결제 정보와 경보를 보고 판정해 주세요.'
