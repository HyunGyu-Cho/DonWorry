import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildMockOwnerResults } from '../src/api/mock/payment.ts'
import {
  linkExpiresText,
  MAIL_KIND,
  OWNER_RESULT,
  OWNER_RESULT_ORDER,
  ownerCounts,
} from '../src/utils/buyerOwner.ts'

const now = new Date('2026-10-24T03:00:00Z')
const INTERNAL = /점수|\d+점|Rule|룰|FDS|AI|위험도/

test('사장님 통계는 결과별로 센다', () => {
  const rows = buildMockOwnerResults(now)
  const counts = ownerCounts(rows)
  assert.equal(
    OWNER_RESULT_ORDER.reduce((s, k) => s + counts[k], 0),
    rows.length,
  )
  assert.deepEqual(ownerCounts([]), { CHECKING: 0, ACCEPTED: 0, REJECTED: 0, AUTO_BLOCKED: 0 })
})

test('사장님 화면 라벨에 내부 용어가 없다', () => {
  for (const k of OWNER_RESULT_ORDER) {
    assert.doesNotMatch(OWNER_RESULT[k].label + OWNER_RESULT[k].note, INTERNAL)
  }
})

test('링크 만료 안내는 남은 시간으로 말한다', () => {
  const in23h = new Date(now.getTime() + 23.5 * 3_600_000).toISOString()
  assert.equal(linkExpiresText(in23h, now), '이 링크는 23시간 뒤 만료돼요')
  const in10m = new Date(now.getTime() + 10 * 60_000).toISOString()
  assert.equal(linkExpiresText(in10m, now), '이 링크는 1시간 안에 만료돼요')
})

test('메일 종류 라벨이 모두 있다', () => {
  for (const k of ['CHECK', 'PAYMENT', 'FDS', 'RESULT', 'FUNDS'] as const)
    assert.ok(MAIL_KIND[k].label)
})
