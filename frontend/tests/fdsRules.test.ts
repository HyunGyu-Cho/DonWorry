import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { MOCK_RULES } from '../src/api/mock/fds.ts'
import { resultForScore, RULE_GUIDE } from '../src/config/fdsRules.ts'
import {
  PAYMENT_RULE_CODES,
  RETIRED_PAYMENT_RULE_CODES,
  STAFF_RULE_CODES,
} from '../src/types/fds.ts'

// 경계 점수의 판정이 기획(50 · 80, ADR-0023)과 다르면 시연 결과가 틀린다
test('resultForScore_atBandBoundaries', () => {
  assert.equal(resultForScore(0), 'ALLOW')
  assert.equal(resultForScore(49), 'ALLOW')
  assert.equal(resultForScore(50), 'REVIEW')
  assert.equal(resultForScore(79), 'REVIEW')
  assert.equal(resultForScore(80), 'DENY')
  // 차단 목록 일치는 점수와 관계없이 거절
  assert.equal(resultForScore(0, true), 'DENY')
})

const migration = (name: string) =>
  readFileSync(
    new URL(`../../backend/src/main/resources/db/migration/${name}`, import.meta.url),
    'utf8',
  )

type SeedRule = {
  ruleCode: string
  displayCode: string | null
  target: string
  action: string
  score: number
  severity: string | null
}

// 첫 시드(V20261024_102018)에 R01~R08 교체(V20261027_211105)를 겹친 결과 = 지금 DB 카탈로그
function seededCatalog(): SeedRule[] {
  const first = migration('V20261024_102018__seed_fds_rules.sql')
  const replace = migration('V20261027_211105__replace_payment_rules_with_r01_r08.sql')
  const row = (m: RegExpMatchArray, displayCode: string | null, offset: number): SeedRule => ({
    ruleCode: m[1],
    displayCode,
    target: m[2 + offset],
    action: m[3 + offset],
    score: Number(m[4 + offset]),
    severity: m[5 + offset] === 'NULL' ? null : m[5 + offset].replaceAll("'", ''),
  })
  const rules = [
    ...first.matchAll(
      /\('(\w+)', '(PAYMENT|STAFF)', '[^']*',\s*'[^']*', '(\w+)', (\d+), (NULL|'\w+')/g,
    ),
  ].map((m) => row(m, null, 0))
  for (const m of replace.matchAll(
    /UPDATE fds_rules\s+SET ([\s\S]*?)WHERE rule_code = '(\w+)';/g,
  )) {
    const target = rules.find((r) => r.ruleCode === m[2])
    assert.ok(target, m[2])
    target.displayCode = m[1].match(/display_code = '(R\d\d)'/)?.[1] ?? target.displayCode
    const score = m[1].match(/score\s+= (\d+)/)?.[1]
    if (score) target.score = Number(score)
  }
  const retired = replace.match(/WHERE rule_code IN \(([^)]*)\)/)?.[1] ?? ''
  const added = [
    ...replace.matchAll(
      /\('(\w+)', '(R\d\d)', '(PAYMENT|STAFF)', '[^']*',\s*'[^']*', '(\w+)', (\d+), (NULL|'\w+')/g,
    ),
  ].map((m) => row(m, m[2], 1))
  const active = [...rules, ...added].filter((r) => !retired.includes(`'${r.ruleCode}'`))
  const payment = active
    .filter((r) => r.target === 'PAYMENT')
    .sort((a, b) => (a.displayCode ?? '').localeCompare(b.displayCode ?? ''))
  return [...payment, ...active.filter((r) => r.target === 'STAFF')]
}

// 화면의 Rule 목록 · 점수가 DB 시드와 다르면 "화면은 +20, 실제는 +15" 같은 일이 생긴다
test('mockRules_matchSeedCatalog', () => {
  const seeded = seededCatalog()
  assert.equal(seeded.length, 15)
  assert.deepEqual(
    MOCK_RULES.map(({ ruleCode, displayCode, target, action, score, severity }) => ({
      ruleCode,
      displayCode,
      target,
      action,
      score,
      severity,
    })),
    seeded,
  )
  assert.deepEqual(
    MOCK_RULES.filter((r) => r.target === 'PAYMENT').map((r) => r.displayCode),
    ['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08'],
  )
  assert.equal(MOCK_RULES.filter((r) => r.target === 'STAFF').length, 7)
})

// 새 Rule이 생겼는데 설명이 없으면 화면에 빈칸이 생긴다. 폐지 Rule은 과거 기록용 설명만 남는다
test('ruleGuide_coversEveryRuleCode', () => {
  const codes = [...PAYMENT_RULE_CODES, ...STAFF_RULE_CODES]
  const all = [...codes, ...RETIRED_PAYMENT_RULE_CODES]
  assert.deepEqual(Object.keys(RULE_GUIDE).sort(), [...all].sort())
  for (const code of all) {
    const guide = RULE_GUIDE[code]
    assert.ok(guide.group && guide.effect && guide.example && guide.alone, code)
  }
  assert.deepEqual(MOCK_RULES.map((r) => r.ruleCode).sort(), [...codes].sort())
})
