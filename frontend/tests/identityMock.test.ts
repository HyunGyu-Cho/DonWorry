import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AccountLockedError, InvalidOtpError } from '../src/api/auth.ts'
import {
  buildMockLoginEvents,
  DEMO_OTP,
  mockStartLogin,
  mockVerifyOtp,
} from '../src/api/mock/identity.ts'

const challengeOf = async (loginId: string) => {
  const step = await mockStartLogin(loginId, '1234')
  assert.equal(step.status, 'OTP_REQUIRED')
  return step.challengeId
}

// 틀린 OTP로 로그인되면 "2단계 인증이 막는다"는 시연 장면이 거짓이 된다
test('mockVerifyOtp_whenWrongCode_rejects', async () => {
  const challengeId = await challengeOf('jiwon')
  await assert.rejects(mockVerifyOtp(challengeId, '000000'), InvalidOtpError)
  await assert.rejects(mockVerifyOtp('mock-unknown', DEMO_OTP), InvalidOtpError)
  const user = await mockVerifyOtp(challengeId, DEMO_OTP)
  assert.equal(user.loginId, 'jiwon')
  // 한 번 쓴 인증 요청은 다시 쓸 수 없다
  await assert.rejects(mockVerifyOtp(challengeId, DEMO_OTP), InvalidOtpError)
})

// 직원은 OTP를 거쳐야 하고, 사장님은 비밀번호만으로 끝난다
test('mockStartLogin_whenStaff_requiresOtp_whenOwner_succeeds', async () => {
  for (const loginId of ['jiwon', 'yunseo']) {
    assert.equal((await mockStartLogin(loginId, '1234')).status, 'OTP_REQUIRED')
  }
  // 이도현은 분산 공격 장면에서 잠긴 상태로 시작한다 (직원 접속 감시에서 잠금 해제)
  await assert.rejects(mockStartLogin('dohyun', '1234'), AccountLockedError)
  const owner = await mockStartLogin('boss', '1234')
  assert.equal(owner.status, 'SUCCESS')
  assert.equal(owner.status === 'SUCCESS' && owner.user.role, 'OPERATOR')
})

// 분산 공격 데이터가 직원 Rule 6 · 7 기준(10분)에 맞아야 시연이 성립한다
test('mockLoginEvents_distributedAttack_hasFiveOrMoreIpsPerAccount', () => {
  const now = new Date('2026-10-24T01:00:00Z')
  const since = new Date(now.getTime() - 10 * 60_000).toISOString()
  const failures = buildMockLoginEvents(now).filter(
    (row) => row.result !== 'SUCCESS' && row.occurredAt >= since,
  )
  const ipsByAccount = new Map<string, Set<string>>()
  const accountsByIp = new Map<string, Set<string>>()
  for (const row of failures) {
    ipsByAccount.set(
      row.loginIdAttempted,
      (ipsByAccount.get(row.loginIdAttempted) ?? new Set()).add(row.ip.address),
    )
    accountsByIp.set(
      row.ip.address,
      (accountsByIp.get(row.ip.address) ?? new Set()).add(row.loginIdAttempted),
    )
  }
  // 분산 로그인 실패: 한 계정에 IP 5개 이상
  assert.ok((ipsByAccount.get('jiwon')?.size ?? 0) >= 5)
  // 비밀번호 뿌리기: 한 IP가 직원 계정 2개 이상
  assert.ok([...accountsByIp.values()].some((accounts) => accounts.size >= 2))
})
