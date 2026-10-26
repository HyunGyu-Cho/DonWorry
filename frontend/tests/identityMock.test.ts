import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { AccountLockedError, InvalidCredentialsError, InvalidOtpError } from '../src/api/auth.ts'
import {
  buildMockLoginEvents,
  DEMO_EMAIL_CODE,
  DEMO_OTP,
  mockStartLogin,
  mockVerifyOtp,
  resetMockIdentity,
} from '../src/api/mock/identity.ts'

beforeEach(() => resetMockIdentity())

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

// 직원은 OTP를 거쳐야 하고, 사장님은 평소엔 비밀번호만으로 끝난다 (처음 보는 기기면 이메일 확인 — 아래 테스트)
test('mockStartLogin_whenStaff_requiresOtp_whenOwner_succeeds', async () => {
  await passEmailStep('boss')
  for (const loginId of ['jiwon', 'yunseo']) {
    assert.equal((await mockStartLogin(loginId, '1234')).status, 'OTP_REQUIRED')
  }
  // 이도현은 분산 공격 장면에서 잠긴 상태로 시작한다 (로그인 모니터링에서 잠금 해제)
  await assert.rejects(mockStartLogin('dohyun', '1234'), AccountLockedError)
  const owner = await mockStartLogin('boss', '1234')
  assert.equal(owner.status, 'SUCCESS')
  assert.equal(owner.status === 'SUCCESS' && owner.user.role, 'OPERATOR')
})

// 사장님 첫 로그인(새 기기)을 이메일 코드로 마쳐 이 기기를 기억하게 한다
async function passEmailStep(loginId: string) {
  const step = await mockStartLogin(loginId, '1234')
  if (step.status === 'OTP_REQUIRED') await mockVerifyOtp(step.challengeId, DEMO_EMAIL_CODE)
}

// 사장님은 위험할 때만 이메일 확인: 처음 보는 기기 · 비밀번호 5번 이상 틀린 뒤 (비밀번호가 새도 이메일까지 있어야)
test('ownerLogin_stepUpByEmail_onNewDeviceOrRepeatedFailures', async () => {
  const first = await mockStartLogin('boss', '1234')
  assert.equal(first.status, 'OTP_REQUIRED')
  assert.equal(first.status === 'OTP_REQUIRED' && first.method, 'EMAIL')
  assert.equal(first.status === 'OTP_REQUIRED' && first.reason, 'NEW_DEVICE')
  assert.match((first.status === 'OTP_REQUIRED' && first.sentTo) || '', /\*/)
  if (first.status !== 'OTP_REQUIRED') return
  // 인증 앱 코드(직원용)로는 통과하지 못한다
  await assert.rejects(mockVerifyOtp(first.challengeId, '246810'), InvalidOtpError)
  await mockVerifyOtp(first.challengeId, DEMO_EMAIL_CODE)
  // 확인한 기기는 다음부터 묻지 않는다
  assert.equal((await mockStartLogin('boss', '1234')).status, 'SUCCESS')
  // 비밀번호를 5번 틀린 뒤에는 기억한 기기라도 다시 묻는다
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(mockStartLogin('boss', 'wrong'), InvalidCredentialsError)
  }
  const after = await mockStartLogin('boss', '1234')
  assert.equal(after.status === 'OTP_REQUIRED' && after.reason, 'FAILED_ATTEMPTS')
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
  // 분산 무차별 대입: 한 계정에 IP 5개 이상
  assert.ok((ipsByAccount.get('jiwon')?.size ?? 0) >= 5)
  // 패스워드 스프레이: 한 IP가 직원 계정 2개 이상
  assert.ok([...accountsByIp.values()].some((accounts) => accounts.size >= 2))
})
