import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import {
  AccountLockedError,
  StaffActionDoneError,
  StaffActionForbiddenError,
} from '../src/api/auth.ts'
import {
  buildMockLoginEvents,
  buildMockStaffAccounts,
  buildMockStaffSessions,
  mockGetStaffSessions,
  mockStartLogin,
  mockTerminateStaffSession,
  mockUnlockStaffAccount,
  resetMockIdentity,
} from '../src/api/mock/identity.ts'
import { resetMockInvestigation, setMockActor } from '../src/api/mock/investigation.ts'
import type { StaffLoginEvent } from '../src/types/auth.ts'
import {
  accessSummary,
  distributedAttack,
  heatKind,
  loginHeatmap,
  suspiciousSessionIds,
} from '../src/utils/staffAccess.ts'

const MANAGER = { userId: 5, role: 'SECURITY_MANAGER', displayName: '최윤서' } as const
beforeEach(() => {
  resetMockIdentity()
  resetMockInvestigation()
  setMockActor(MANAGER)
})

// 한국 시간 10/24 15:00
const now = new Date('2026-10-24T06:00:00Z')
const ev = (
  occurredAt: string,
  ipType: 'OFFICE' | 'FOREIGN',
  result: StaffLoginEvent['result'] = 'SUCCESS',
): StaffLoginEvent => ({
  loginEventId: 1,
  userId: 4,
  loginIdAttempted: 'jiwon',
  ip: { address: '10.0.0.1', countryCode: 'KR', ipType, label: '사내망' },
  deviceId: null,
  deviceLabel: null,
  result,
  occurredAt,
})

// 칸 색을 잘못 정하면 평소와 다른 접속을 놓친다
test('heatKind_failAndOutsideTakePriority', () => {
  assert.equal(heatKind([]), 'NONE')
  assert.equal(heatKind([ev('', 'OFFICE')]), 'OFFICE_OK')
  assert.equal(heatKind([ev('', 'OFFICE'), ev('', 'FOREIGN')]), 'OUTSIDE_OK')
  assert.equal(heatKind([ev('', 'OFFICE', 'BAD_OTP')]), 'FAIL')
  assert.equal(heatKind([ev('', 'OFFICE'), ev('', 'FOREIGN', 'BAD_OTP')]), 'OUTSIDE_FAIL')
})

// 한국 시간 기준으로 칸에 넣지 않으면 "아침 9시 출근"이 자정 칸에 찍힌다
test('loginHeatmap_placesEventsInSeoulDayAndHour', () => {
  const heat = loginHeatmap(
    [
      ev('2026-10-24T00:10:00Z', 'OFFICE'), // 오늘 09시
      ev('2026-10-23T14:59:00Z', 'FOREIGN', 'BAD_PASSWORD'), // 어제 23시
      ev('2026-10-16T00:00:00Z', 'OFFICE'), // 8일 전 — 지도 밖
    ],
    now,
  )
  assert.equal(heat.length, 7)
  assert.equal(heat[6][9].kind, 'OFFICE_OK')
  assert.equal(heat[5][23].kind, 'OUTSIDE_FAIL')
  const filled = heat.flat().filter((c) => c.kind !== 'NONE').length
  assert.equal(filled, 2)
})

// 같은 직원 세션이 사내와 해외에서 동시에 쓰이면 해외 쪽만 의심 (Mock 박지원 세션 2)
test('suspiciousSessions_flagOutsideTwinOfOfficeSession', () => {
  const sessions = buildMockStaffSessions(now)
  assert.deepEqual([...suspiciousSessionIds(sessions)], [2])
  // 사내 세션이 끝나면 해외 세션 하나만으로는 의심하지 않는다 (재택일 수 있음)
  const officeEnded = sessions.map((s) =>
    s.staffSessionId === 1 ? { ...s, endedAt: s.startedAt } : s,
  )
  assert.equal(suspiciousSessionIds(officeEnded).size, 0)
})

test('accessSummary_countsWithMeaning', () => {
  const events = buildMockLoginEvents(now)
  const sessions = buildMockStaffSessions(now)
  const s = accessSummary(events, sessions, 6, now)
  assert.equal(s.activeSessions, sessions.filter((x) => x.endedAt === null).length)
  assert.equal(s.suspiciousSessions, 1)
  // 오늘 실패: 탈취 OTP 3회 + 분산 공격 40회 + 없는 아이디 1회
  assert.equal(s.todayFailures, 44)
  assert.equal(s.staffAlerts, 6)
})

// IP 하나씩 보면 기준 미달이라도 계정으로 묶으면 공격 (직원 룰 6)
test('distributedAttack_groupsByAccount', () => {
  const attack = distributedAttack(buildMockLoginEvents(now), now)
  assert.ok(attack)
  assert.equal(attack.ips.length, 30)
  assert.equal(attack.belowPerIpThreshold, true)
  assert.equal(attack.totalFailures, 41)
  assert.equal(attack.byAccount[0].loginId, 'jiwon')
  assert.equal(attack.byAccount[0].failures, 30)
  assert.equal(
    attack.ips.reduce((sum, ip) => sum + ip.failures, 0),
    attack.totalFailures,
  )
  // 사내 로그인만 있으면 없음
  assert.equal(distributedAttack([ev(now.toISOString(), 'OFFICE', 'BAD_OTP')], now), null)
})

// 세션 종료 · 잠금 해제는 보안 관리자만, 두 번은 안 된다
test('mockTerminateAndUnlock_onlyManagerOnce', async () => {
  setMockActor({ userId: 4, role: 'SECURITY_STAFF', displayName: '박지원' })
  await assert.rejects(mockTerminateStaffSession(2), StaffActionForbiddenError)
  await assert.rejects(mockUnlockStaffAccount(6), StaffActionForbiddenError)

  setMockActor(MANAGER)
  const ended = await mockTerminateStaffSession(2)
  assert.equal(ended.endReason, 'FORCED')
  assert.ok(!(await mockGetStaffSessions()).some((s) => s.staffSessionId === 2))
  await assert.rejects(mockTerminateStaffSession(2), StaffActionDoneError)

  // 이도현은 분산 공격으로 잠긴 상태 → 로그인 불가 → 잠금 해제 후 가능
  assert.equal(buildMockStaffAccounts(now).find((a) => a.userId === 6)?.locked, true)
  await assert.rejects(mockStartLogin('dohyun', '1234'), AccountLockedError)
  const unlocked = await mockUnlockStaffAccount(6)
  assert.equal(unlocked.locked, false)
  assert.equal((await mockStartLogin('dohyun', '1234')).status, 'OTP_REQUIRED')
  await assert.rejects(mockUnlockStaffAccount(6), StaffActionDoneError)
})

// 직원 정보: 업무 PC 설명은 서버 값, 마지막 로그인은 마지막 성공
test('staffAccounts_useLastSuccessfulLogin', () => {
  const accounts = buildMockStaffAccounts(now)
  const jiwon = accounts.find((a) => a.displayName === '박지원')!
  assert.equal(jiwon.workPc?.label, '사내망 · 박지원 업무 PC')
  assert.equal(jiwon.otpEnrolled, true)
  // 박지원의 마지막 성공은 집 PC (사내망 밖), 이후 해외 시도는 실패라 안 바뀜
  assert.equal(jiwon.lastLoginOutside, true)
  assert.ok(accounts.every((a) => a.role === 'SECURITY_STAFF' || a.role === 'SECURITY_MANAGER'))
})
