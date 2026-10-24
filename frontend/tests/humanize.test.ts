import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GLOSSARY } from '../src/config/glossary.ts'
import {
  cardName,
  countryName,
  koreanWon,
  placeName,
  relativeTime,
  timesUsual,
} from '../src/utils/humanize.ts'

// 금액을 잘못 읽으면 직원이 우선순위를 잘못 정한다
test('koreanWon_readsLikeKorean', () => {
  assert.equal(koreanWon(650000), '65만 원')
  assert.equal(koreanWon(38000), '3만 8,000원')
  assert.equal(koreanWon(12_500_000), '1,250만 원')
  assert.equal(koreanWon(900), '900원')
  assert.equal(koreanWon(0), '0원')
  assert.equal(koreanWon(-991_100), '−99만 1,100원')
})

// 한국 시간 자정 · 어제 경계에서 "오늘"을 잘못 붙이면 사건 순서를 오해한다
test('relativeTime_usesSeoulDayBoundaries', () => {
  // 한국 시간 10/24 15:00
  const now = new Date('2026-10-24T06:00:00Z')
  assert.equal(relativeTime('2026-10-24T05:59:30Z', now), '방금')
  assert.equal(relativeTime('2026-10-24T05:57:00Z', now), '3분 전')
  assert.equal(relativeTime('2026-10-24T04:00:00Z', now), '2시간 전')
  assert.equal(relativeTime('2026-10-24T00:10:00Z', now), '오늘 09:10')
  // 한국 시간 10/24 00:30 (UTC로는 10/23)
  assert.equal(relativeTime('2026-10-23T15:30:00Z', now), '오늘 00:30')
  assert.equal(relativeTime('2026-10-23T14:59:00Z', now), '어제 23:59')
  assert.equal(relativeTime('2026-10-20T03:00:00Z', now), '10월 20일')
  assert.equal(relativeTime('2025-10-20T03:00:00Z', now), '2025년 10월 20일')
})

// 화면에 IP · 카드 원문이 나오면 안 된다 (원문은 펼치기 안에만)
test('placeAndCard_neverLeakRawValues', () => {
  assert.equal(placeName('사내망 · 박지원 업무 PC'), '사내망 · 박지원 업무 PC')
  assert.equal(placeName(null), '확인되지 않은 접속 위치')
  assert.equal(placeName('  '), '확인되지 않은 접속 위치')
  assert.doesNotMatch(placeName(undefined), /\d+\.\d+/)
  assert.equal(cardName('1173'), '끝자리 1173 카드')
  assert.equal(cardName('4111111111111111'), '카드')
  assert.equal(cardName(null), '카드')
  assert.equal(countryName('us'), '미국')
  assert.equal(countryName('ZZ'), '해외')
  assert.equal(countryName(null), '알 수 없는 나라')
})

test('timesUsual_givesMeaningToNumbers', () => {
  assert.equal(timesUsual(650000, 40000), '평소의 16배')
  assert.equal(timesUsual(90000, 40000), '평소의 2.3배')
  assert.equal(timesUsual(50000, 40000), '평소 수준')
  assert.equal(timesUsual(50000, null), null)
  assert.equal(timesUsual(50000, 0), null)
})

// 풀이가 비어 있거나 다른 내부 용어로만 풀면 툴팁이 쓸모없다
test('glossary_hasPlainExplanations', () => {
  const entries = Object.entries(GLOSSARY)
  assert.ok(entries.length >= 15)
  for (const [key, { term, text }] of entries) {
    assert.ok(term.trim().length > 0, key)
    assert.ok(text.length >= 20 && text.length <= 120, `${key} ${text.length}자`)
    assert.match(text, /[.다]$/, key)
    assert.doesNotMatch(text, /[A-Z]{2,}-\d+/, key)
  }
})
