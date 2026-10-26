// P4 AI 조사 과정 Mock — 단계 정의와 시각으로 진행 상태를 계산한다 (프로토타입 v4.2 흐름)
// 테스트가 직접 불러오므로 import.meta.env를 읽는 mockMode는 쓰지 않는다
import type { ReportRun, ReportStep, ReportStepKind, ReportToolName } from '../../types/report.ts'

// [종류, 이름, Tool, 걸리는 시간(ms), 물어본 것, 받은 것]
export type StepDef = [ReportStepKind, string, ReportToolName | null, number, string, string]

const TOOL_LABEL: Record<ReportToolName, string> = {
  get_fds_evidence: 'FDS 점수 · 적중 Rule 조회',
  get_case_payments: '사건에 묶인 결제 조회',
  get_payment_history: '고객 과거 결제 조회',
  get_payment_authentication: '카드 인증 · 승인 정보 조회',
  get_security_events: '로그인 · 기기 기록 조회',
  get_order_context: '주문 · 구매자 정보 조회',
  find_similar_cases: '비슷한 사건 찾기',
}

export const req = (asked: string): StepDef => [
  'REQUEST',
  '조사 요청 접수',
  null,
  400,
  asked,
  '사건이 생기자 Spring이 자동으로 ai-server에 조사를 맡김',
]
export const tool = (name: ReportToolName, ms: number, asked: string, got: string): StepDef => [
  'TOOL',
  TOOL_LABEL[name],
  name,
  ms,
  asked,
  got,
]
export const llm = (got: string, label = 'AI 판단', ms = 3200): StepDef => [
  'LLM',
  label,
  null,
  ms,
  '근거 요약 · 판단 요청',
  got,
]
export const llmFailed = (attempt: number, got: string, ms = 2600): StepDef => [
  'LLM_FAILED',
  `AI 판단 (${attempt}차)`,
  null,
  ms,
  '근거 요약 · 판단 요청',
  got,
]
export const finish = (version: number): StepDef[] => [
  [
    'VALIDATE',
    '구조 검증',
    null,
    500,
    '보고서 형식 · 필수 항목',
    '통과 · 사건 밖 결제를 언급하지 않음',
  ],
  ['SAVE', '보고서 저장', null, 500, `보고서 v${version}`, '저장 완료 · 사건이 판정 대기로 바뀜'],
]

export const totalMs = (defs: StepDef[]) => defs.reduce((sum, d) => sum + d[3], 0)

// now가 없으면 모든 단계가 끝난 기록, 있으면 그 시각까지 시작한 단계만 보인다
export function buildRun(
  caseId: string,
  reportVersion: number,
  defs: StepDef[],
  startedAt: Date,
  now: Date | null = null,
): ReportRun {
  const elapsed = now ? now.getTime() - startedAt.getTime() : Infinity
  const steps: ReportStep[] = []
  let offset = 0
  for (const [i, [kind, label, toolName, ms, asked, got]] of defs.entries()) {
    if (elapsed < offset) break
    const running = elapsed < offset + ms
    steps.push({
      stepNo: i + 1,
      kind,
      label,
      toolName,
      startedAt: new Date(startedAt.getTime() + offset).toISOString(),
      durationMs: running ? null : ms,
      asked,
      got: running ? null : got,
      status: running ? 'RUNNING' : kind === 'LLM_FAILED' ? 'FAILED' : 'DONE',
    })
    offset += ms
  }
  const done = elapsed >= totalMs(defs)
  return {
    caseId,
    reportVersion,
    status: done ? 'SUCCEEDED' : 'RUNNING',
    startedAt: startedAt.toISOString(),
    finishedAt: done ? new Date(startedAt.getTime() + totalMs(defs)).toISOString() : null,
    steps,
    currentStepNo: done ? null : (steps.at(-1)?.stepNo ?? null),
  }
}
