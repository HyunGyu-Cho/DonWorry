import { parseMockSetting, type MockArea } from './mockSetting'

// 빌드할 때 정해지는 값이라 앱이 실행되는 동안에는 바뀌지 않는다
export const mockAreas = parseMockSetting(import.meta.env.VITE_USE_MOCK)

// 사용 예: export const getRules = isMock('fds') ? mockGetRules : realGetRules
export const isMock = (area: MockArea) => mockAreas.has(area)
