import { useSyncExternalStore } from 'react'

// 진행 중인 튜토리얼 — 탭을 닫기 전까지 기억한다 (새로 고침해도 이어서)
// path = 단계를 정할 때 있던 화면 (같은 화면에 있는 동안은 자동으로 넘기지 않는다)
export type TutorialState = {
  scenarioId: number | null
  step: number
  path: string | null
  collapsed: boolean
}

const KEY = 'dw-tutorial'
const EMPTY: TutorialState = { scenarioId: null, step: 0, path: null, collapsed: false }

function read(): TutorialState {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return EMPTY
    const v = JSON.parse(raw) as Partial<TutorialState>
    return {
      scenarioId: typeof v.scenarioId === 'number' ? v.scenarioId : null,
      step: typeof v.step === 'number' ? v.step : 0,
      path: typeof v.path === 'string' ? v.path : null,
      collapsed: v.collapsed === true,
    }
  } catch {
    return EMPTY
  }
}

let state: TutorialState = read()
const listeners = new Set<() => void>()

function set(next: TutorialState) {
  state = next
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 유지
  }
  listeners.forEach((l) => l())
}

export const tutorialStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => state,
  start: (scenarioId: number) => set({ ...EMPTY, scenarioId }),
  setStep: (step: number, path: string | null) => set({ ...state, step, path }),
  setCollapsed: (collapsed: boolean) => set({ ...state, collapsed }),
  stop: () => set(EMPTY),
}

export const useTutorial = () =>
  useSyncExternalStore(tutorialStore.subscribe, tutorialStore.getSnapshot)

// 다시 불러오라는 신호 — 시연 버튼으로 Mock 데이터를 바꾼 뒤 사건 화면이 새로 읽게
export const DEMO_CHANGED = 'donworry:demo-changed'

// 화면이 튜토리얼에 알리는 일 (예: DECIDED = 판정 확정) — 그 일을 기다리던 단계는 다음으로 넘어간다
export const TUTORIAL_EVENT = 'donworry:tutorial'
