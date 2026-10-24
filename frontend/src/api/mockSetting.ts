// Mock 영역 이름은 백엔드 모듈(역할) 이름과 같다 — P1 identity ~ P6 settlement
export const MOCK_AREAS = [
  'identity',
  'fds',
  'investigation',
  'report',
  'payment',
  'settlement',
] as const

export type MockArea = (typeof MOCK_AREAS)[number]

const isMockArea = (name: string): name is MockArea =>
  (MOCK_AREAS as readonly string[]).includes(name)

// VITE_USE_MOCK 값 해석: 비어 있거나 false면 없음, true면 전부, 쉼표 목록이면 적은 영역만
// 모르는 영역 이름은 경고만 남기고 무시한다 (오타 하나로 앱이 멈추지 않게)
export function parseMockSetting(
  raw: string | undefined,
  warn: (message: string) => void = console.warn,
): ReadonlySet<MockArea> {
  const value = (raw ?? '').trim().toLowerCase()
  if (value === '' || value === 'false') return new Set()
  if (value === 'true') return new Set(MOCK_AREAS)

  const areas = new Set<MockArea>()
  for (const name of value.split(',').map((part) => part.trim())) {
    if (name === '') continue
    if (isMockArea(name)) areas.add(name)
    else warn(`VITE_USE_MOCK: 알 수 없는 영역 "${name}"은 무시합니다. (${MOCK_AREAS.join(', ')})`)
  }
  return areas
}
