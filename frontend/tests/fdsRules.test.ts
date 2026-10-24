import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { MOCK_RULES } from '../src/api/mock/fds.ts'
import { resultForScore, RULE_GUIDE } from '../src/config/fdsRules.ts'
import { PAYMENT_RULE_CODES, STAFF_RULE_CODES } from '../src/types/fds.ts'

// 경계 점수의 판정이 기획(40 · 70)과 다르면 시연 결과가 틀린다
test('resultForScore_atBandBoundaries', () => {
  assert.equal(resultForScore(0), 'ALLOW')
  assert.equal(resultForScore(39), 'ALLOW')
  assert.equal(resultForScore(40), 'REVIEW')
  assert.equal(resultForScore(69), 'REVIEW')
  assert.equal(resultForScore(70), 'DENY')
  // 차단 목록 일치는 점수와 관계없이 거절
  assert.equal(resultForScore(0, true), 'DENY')
})

// 화면의 Rule 목록 · 점수가 DB 시드와 다르면 "화면은 +20, 실제는 +15" 같은 일이 생긴다
test('mockRules_matchSeedCatalog', () => {
  const seed = readFileSync(
    new URL(
      '../../backend/src/main/resources/db/migration/V20261024_102018__seed_fds_rules.sql',
      import.meta.url,
    ),
    'utf8',
  )
  const pattern = /\('(\w+)', '(PAYMENT|STAFF)', '[^']*',\s*'[^']*', '(\w+)', (\d+), (NULL|'\w+')/g
  const seeded = [...seed.matchAll(pattern)].map((m) => ({
    ruleCode: m[1],
    target: m[2],
    action: m[3],
    score: Number(m[4]),
    severity: m[5] === 'NULL' ? null : m[5].replaceAll("'", ''),
  }))
  assert.equal(seeded.length, 15)
  assert.deepEqual(
    MOCK_RULES.map(({ ruleCode, target, action, score, severity }) => ({
      ruleCode,
      target,
      action,
      score,
      severity,
    })),
    seeded,
  )
  assert.equal(MOCK_RULES.filter((r) => r.target === 'PAYMENT').length, 8)
  assert.equal(MOCK_RULES.filter((r) => r.target === 'STAFF').length, 7)
})

// 새 Rule이 생겼는데 설명이 없으면 화면에 빈칸이 생긴다
test('ruleGuide_coversEveryRuleCode', () => {
  const codes = [...PAYMENT_RULE_CODES, ...STAFF_RULE_CODES]
  assert.deepEqual(Object.keys(RULE_GUIDE).sort(), [...codes].sort())
  for (const code of codes) {
    const guide = RULE_GUIDE[code]
    assert.ok(guide.group && guide.effect && guide.example && guide.alone, code)
  }
  assert.deepEqual(MOCK_RULES.map((r) => r.ruleCode).sort(), [...codes].sort())
})
