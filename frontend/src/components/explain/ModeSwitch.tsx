import { Segmented } from 'antd'
import { useScreenMode, type ScreenMode } from './useScreenMode'

// 헤더에 두는 튜토리얼 / 업무 모드 전환
export function ModeSwitch() {
  const { mode, setMode } = useScreenMode()
  return (
    <Segmented<ScreenMode>
      size="small"
      value={mode}
      onChange={setMode}
      options={[
        { label: '튜토리얼', value: 'TUTORIAL' },
        { label: '업무', value: 'WORK' },
      ]}
    />
  )
}
