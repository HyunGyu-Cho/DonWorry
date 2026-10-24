import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MOCK_AREAS, parseMockSetting } from '../src/api/mockSetting.ts'

const silent = () => {}

// 설정을 안 했는데 가짜 데이터가 진짜처럼 나오면 안 된다
test('parseMockSetting_whenUnset_mocksNothing', () => {
  assert.equal(parseMockSetting(undefined, silent).size, 0)
  assert.equal(parseMockSetting('', silent).size, 0)
  assert.equal(parseMockSetting('  false ', silent).size, 0)
})

// 실제 API로 바꾼 영역은 Mock 목록에서 빠져야 한다
test('parseMockSetting_whenAreaList_mocksOnlyListedAreas', () => {
  const warnings: string[] = []
  const areas = parseMockSetting(' fds, payment ,fsd', (m) => warnings.push(m))
  assert.deepEqual([...areas].sort(), ['fds', 'payment'])
  assert.equal(areas.has('investigation'), false)
  assert.equal(warnings.length, 1)
})

// 백엔드 없이 시연할 때는 모든 영역이 Mock이어야 한다
test('parseMockSetting_whenTrue_mocksAllAreas', () => {
  assert.deepEqual([...parseMockSetting('TRUE', silent)].sort(), [...MOCK_AREAS].sort())
})
