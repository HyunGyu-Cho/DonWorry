// 튜토리얼 단계 계산 — React 없이 순수 함수만 (node 테스트가 직접 불러온다)
import type { TutorialStep } from '../config/tutorialSteps.ts'

// 지금 주소에 맞는 단계. 지금 단계 화면이면 그대로, 뒤 단계의 화면에 들어오면 그 단계로 (앞 단계로는 돌아가지 않는다)
export function stepForPath(steps: TutorialStep[], current: number, path: string): number {
  if (steps[current]?.path === path) return current
  const next = steps.findIndex((s, i) => i > current && s.path === path)
  return next === -1 ? current : next
}

// 화면이 바뀌었을 때만 자동으로 넘긴다 — [다음]을 누른 화면에 머무는 동안은 누른 단계를 지킨다
export function resolveStep(
  steps: TutorialStep[],
  state: { step: number; path: string | null },
  path: string,
): number {
  return state.path === path ? state.step : stepForPath(steps, state.step, path)
}

export const clampStep = (steps: TutorialStep[], index: number) =>
  Math.max(0, Math.min(index, steps.length))

// 마지막 단계 다음 = 끝 (steps.length)
export const isDone = (steps: TutorialStep[], index: number) => index >= steps.length

export const progressText = (steps: TutorialStep[], index: number) =>
  `${Math.min(index + 1, steps.length)} / ${steps.length}단계`

// nav 메뉴 이름표: /security/actions → nav-security-actions
export const navTour = (path: string) => `nav${path.replace(/\//g, '-')}`
