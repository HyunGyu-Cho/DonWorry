import { Tag, Tooltip } from 'antd'
import { mockAreas } from '../../api/mockMode'
import { MOCK_AREAS, type MockArea } from '../../api/mockSetting'

const AREA_LABELS: Record<MockArea, string> = {
  identity: 'P1 인증',
  fds: 'P2 FDS',
  investigation: 'P3 사건',
  report: 'P4 AI 보고서',
  payment: 'P5 결제',
  settlement: 'P6 정산',
}

// 헤더에 어떤 영역이 가짜 데이터인지 보여 준다. Mock이 없으면 아무것도 그리지 않는다
export function MockBadge() {
  if (mockAreas.size === 0) return null
  const areas = MOCK_AREAS.filter((area) => mockAreas.has(area))
  const text = areas.length === MOCK_AREAS.length ? 'Mock: 전체' : `Mock: ${areas.join(' · ')}`
  return (
    <Tooltip title={`가짜 데이터로 보이는 영역: ${areas.map((a) => AREA_LABELS[a]).join(', ')}`}>
      <Tag color="orange" style={{ marginInlineEnd: 0 }}>
        {text}
      </Tag>
    </Tooltip>
  )
}
