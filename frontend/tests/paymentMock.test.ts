import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { beforeEach, test } from 'node:test'
import {
  buildMockNotifications,
  buildMockOwnerResults,
  buildMockPayments,
  mockAnswerBuyerConfirm,
  mockGetBuyerConfirmRequest,
  resetMockPayment,
} from '../src/api/mock/payment.ts'
import { ConfirmAlreadyAnsweredError, ConfirmLinkExpiredError } from '../src/api/paymentErrors.ts'

beforeEach(() => resetMockPayment())

const now = new Date('2026-10-24T03:00:00Z')
// 구매자 · 사장님에게 보이면 안 되는 내부 용어 (공격자가 기준을 알아내거나 사장님이 오해한다)
const INTERNAL = /점수|\d+점|Rule|룰|FDS|AI|위험도|REVIEW|DENY/

// 공개 확인 페이지에 사유 · 점수가 나오면 공격자가 탐지 기준을 알아낸다
test('buyerConfirmRequest_hidesReasonAndScore', async () => {
  const view = await mockGetBuyerConfirmRequest('demo-check-31')
  assert.deepEqual(Object.keys(view).sort(), [
    'amount',
    'answered',
    'expiresAt',
    'merchantName',
    'orderTitle',
    'paidAt',
  ])
  assert.doesNotMatch(JSON.stringify(view), INTERNAL)
  assert.equal(view.answered, null)
})

// 사장님 화면에 내부 점수나 구매자 개인정보가 나오면 안 된다
test('ownerResults_hideInternalAndBuyerFields', () => {
  for (const row of buildMockOwnerResults(now)) {
    const text = JSON.stringify(row)
    assert.doesNotMatch(row.guide, INTERNAL, row.paymentId)
    for (const field of ['riskScore', 'buyerEmail', 'clientIp', 'deviceId', 'cardLast4']) {
      assert.ok(!(field in row), `${row.paymentId} ${field}`)
    }
    assert.doesNotMatch(text, /@|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, row.paymentId)
  }
})

// 구매자 · 사장님 메일 제목에도 내부 용어가 없어야 한다 (자동 차단 안내의 "고위험"은 허용)
test('notificationSubjects_hideScoreAndRules', () => {
  for (const n of buildMockNotifications(now)) {
    assert.doesNotMatch(n.subject.replace('[돈워리] ', ''), INTERNAL, n.subject)
    assert.equal(n.status === 'SENT', n.sentAt !== null, n.subject)
    assert.equal(n.status === 'FAILED', n.failureReason !== null, n.subject)
  }
})

// 링크를 두 번 쓸 수 있으면 공격자가 구매자 대신 "제가 결제했어요"로 바꿀 수 있다
test('buyerConfirm_answersOnlyOnce', async () => {
  const saved = await mockAnswerBuyerConfirm('demo-check-31', 'NOT_MINE')
  assert.equal(saved.paymentId, '31')
  assert.equal(saved.answer, 'NOT_MINE')
  await assert.rejects(mockAnswerBuyerConfirm('demo-check-31', 'MINE'), ConfirmAlreadyAnsweredError)
  assert.equal((await mockGetBuyerConfirmRequest('demo-check-31')).answered, 'NOT_MINE')
  await assert.rejects(mockAnswerBuyerConfirm('demo-expired', 'MINE'), ConfirmLinkExpiredError)
  await assert.rejects(mockGetBuyerConfirmRequest('no-such-token'), ConfirmLinkExpiredError)
})

// 메일 · 결과 Mock이 없는 결제를 가리키면 화면 연결이 깨진다
test('mockNotificationsAndResults_referExistingPayments', () => {
  const ids = new Set(buildMockPayments(now).map((p) => p.paymentId))
  for (const n of buildMockNotifications(now)) {
    if (n.paymentId !== null) assert.ok(ids.has(n.paymentId), n.subject)
    else assert.equal(n.kind, 'FUNDS')
  }
  const held = buildMockOwnerResults(now).find((r) => r.result === 'CHECKING')
  assert.equal(held?.paymentStatus, 'HELD')
})

// 화면 값이 DB 값과 다르면 백엔드 연결 때 저장이 거부된다
test('paymentValues_matchMigrationComments', () => {
  const read = (file: string) =>
    readFileSync(
      new URL(`../../backend/src/main/resources/db/migration/${file}`, import.meta.url),
      'utf8',
    )
  const notifications = read('V20261024_102015__create_notifications_table.sql')
  const confirmations = read('V20261024_102016__create_buyer_confirmations_table.sql')
  const comment = (sql: string, column: string) =>
    sql
      .match(new RegExp(`${column}\\s.*-- ([A-Z_ /]+)`))![1]
      .split('/')
      .map((v) => v.trim())
  const rows = buildMockNotifications(now)
  for (const n of rows) {
    assert.ok(comment(notifications, 'recipient_type').includes(n.recipientType))
    assert.ok(comment(notifications, 'kind').includes(n.kind))
    assert.ok(comment(notifications, 'status').includes(n.status))
  }
  assert.deepEqual(comment(confirmations, 'answer'), ['MINE', 'NOT_MINE'])
})
