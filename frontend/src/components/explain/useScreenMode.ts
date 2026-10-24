import { createContext, useContext } from 'react'

// 튜토리얼 = 안내 패널과 시연 버튼을 보임, 업무 = 실제 업무 화면만 (패널은 1-12)
export type ScreenMode = 'TUTORIAL' | 'WORK'

export const ScreenModeContext = createContext<{
  mode: ScreenMode
  setMode: (m: ScreenMode) => void
}>({ mode: 'WORK', setMode: () => {} })

export const useScreenMode = () => useContext(ScreenModeContext)
