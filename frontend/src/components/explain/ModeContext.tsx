import { useState, type ReactNode } from 'react'
import { ScreenModeContext, type ScreenMode } from './useScreenMode'

const KEY = 'dw-screen-mode'

function readMode(): ScreenMode {
  try {
    return localStorage.getItem(KEY) === 'TUTORIAL' ? 'TUTORIAL' : 'WORK'
  } catch {
    return 'WORK'
  }
}

// 고른 모드는 이 브라우저에만 기억한다 (못 쓰면 이번 화면에서만 유지)
export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ScreenMode>(readMode)
  const setMode = (next: ScreenMode) => {
    setModeState(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // 저장소를 못 쓰는 브라우저
    }
  }
  return (
    <ScreenModeContext.Provider value={{ mode, setMode }}>{children}</ScreenModeContext.Provider>
  )
}
