// P1 identity Mock — 시드(migration)와 같은 계정 · 가짜 IP를 쓴다 (docs/erd 7절)
// 테스트가 직접 불러오므로 import.meta.env를 읽는 mockMode는 쓰지 않는다
import {
  AccountLockedError,
  InvalidCredentialsError,
  InvalidOtpError,
  ReauthPasswordError,
  StaffActionDoneError,
  StaffActionForbiddenError,
} from '../auth.ts'
import { ApiError } from '../client.ts'
import { getMockActor, mockRecordStaffAction, setMockActor } from './investigation.ts'
import { mockEpoch, mockRespond } from './respond.ts'
import type {
  AuthUser,
  ReauthTicket,
  IpInfo,
  LoginEventQuery,
  LoginStep,
  StaffLoginEvent,
  StaffAccount,
  StaffSession,
} from '../../types/auth.ts'

export const DEMO_OTP = '246810'
export const DEMO_RECOVERY_CODE = 'DW-RECOVERY-0001'
export const DEMO_PASSWORD = '1234'

const user = (
  userId: number,
  loginId: string,
  displayName: string,
  role: AuthUser['role'],
  extra: Partial<AuthUser> = {},
): AuthUser => ({
  userId,
  loginId,
  displayName,
  role,
  merchantId: null,
  tenantScope: null,
  permissions: [],
  ...extra,
})

// userId는 빈 DB에 시드가 들어간 순서와 같다
export const MOCK_USERS: AuthUser[] = [
  user(1, 'admin', 'demo_shop', 'ADMIN', { tenantScope: 'ALL' }),
  user(2, 'boss', 'demo 사장님', 'OPERATOR', {
    merchantId: 1,
    permissions: ['FDS_VIEW', 'FINANCE_VIEW'],
  }),
  user(3, 'staff_test', 'demo 보안직원', 'SECURITY_STAFF'),
  user(4, 'jiwon', '박지원', 'SECURITY_STAFF'),
  user(5, 'yunseo', '최윤서', 'SECURITY_MANAGER'),
  user(6, 'dohyun', '이도현', 'SECURITY_STAFF'),
]
const needsOtp = (u: AuthUser) => u.role === 'SECURITY_STAFF' || u.role === 'SECURITY_MANAGER'

// seed_demo_fake_ips와 같은 주소
const ip = (address: string, countryCode: string, ipType: IpInfo['ipType'], label: string) => ({
  address,
  countryCode,
  ipType,
  label,
})
export const OFFICE_IP = {
  jiwon: ip('10.20.0.15', 'KR', 'OFFICE', '사내망 · 박지원 업무 PC'),
  yunseo: ip('10.20.0.22', 'KR', 'OFFICE', '사내망 · 최윤서 업무 PC'),
  dohyun: ip('10.20.0.31', 'KR', 'OFFICE', '사내망 · 이도현 업무 PC'),
}
const HOME_IP = ip('175.223.14.90', 'KR', 'DOMESTIC', '국내 가정용 회선 (직원 집)')
const ATTACK_IP = ip('185.220.101.7', 'DE', 'ANONYMOUS', 'Tor 출구 IP (해외 · 탈취 공격자)')
const DIST_NETS: [string, string][] = [
  ['45.83.64.', 'NL'],
  ['91.240.118.', 'RU'],
  ['103.152.220.', 'VN'],
  ['185.191.171.', 'DE'],
  ['194.26.192.', 'GB'],
]
// 표시용 설명은 V20261024_191124 migration과 같다 (IP 대역을 문장에 쓰지 않는다)
const COUNTRY_KO: Record<string, string> = {
  NL: '네덜란드',
  RU: '러시아',
  VN: '베트남',
  DE: '독일',
  GB: '영국',
}
// 분산 공격 IP 30개 (대역 5곳 × 6)
export const DISTRIBUTED_IPS: IpInfo[] = Array.from({ length: 30 }, (_, i) => {
  const [net, country] = DIST_NETS[i % 5]
  return ip(
    net + (17 + ((i * 7) % 200)),
    country,
    'FOREIGN',
    `해외 분산 공격 IP (${COUNTRY_KO[country]})`,
  )
})

const minutesAgo = (now: Date, minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString()

// 시연 시나리오가 들어간 로그인 기록 (최신이 앞)
export function buildMockLoginEvents(now: Date): StaffLoginEvent[] {
  const rows: Omit<StaffLoginEvent, 'loginEventId'>[] = []
  const add = (
    minutes: number,
    loginId: string,
    ipInfo: IpInfo,
    result: StaffLoginEvent['result'],
    deviceLabel: string | null,
  ) => {
    const found = MOCK_USERS.find((u) => u.loginId === loginId)
    rows.push({
      userId: found?.userId ?? null,
      loginIdAttempted: loginId,
      ip: ipInfo,
      deviceId: deviceLabel ? `DEV-${loginId}-${ipInfo.ipType}` : null,
      deviceLabel,
      result,
      occurredAt: minutesAgo(now, minutes),
    })
  }

  // 평소: 사내망 업무 PC에서 매일 출근 로그인
  // 한국 시간 그날 아침 8시 40분쯤 (며칠 전 · 분)
  const kstMorning = (daysAgo: number, minute: number) => {
    const today = new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10)
    const at =
      Date.parse(`${today}T08:${String(minute).padStart(2, '0')}:00+09:00`) - daysAgo * 86_400_000
    return (now.getTime() - at) / 60_000
  }
  for (const day of [3, 2, 1]) {
    add(kstMorning(day, 40), 'jiwon', OFFICE_IP.jiwon, 'SUCCESS', '업무 PC · Chrome · Windows')
    add(kstMorning(day, 47), 'yunseo', OFFICE_IP.yunseo, 'SUCCESS', '업무 PC · Edge · Windows')
    add(kstMorning(day, 52), 'dohyun', OFFICE_IP.dohyun, 'SUCCESS', '업무 PC · Chrome · Windows')
  }
  // 직원 계정 탈취: 집에서 로그인(새 기기) → 해외 Tor IP에서 비밀번호 성공 후 OTP 3회 실패
  add(780, 'jiwon', HOME_IP, 'SUCCESS', '집 PC · Chrome · Windows')
  for (const m of [95, 94, 93]) add(m, 'jiwon', ATTACK_IP, 'BAD_OTP', 'Unknown · Firefox · Linux')
  // 분산 공격: 10분 안에 IP 30개에서 실패 41회 (박지원 30 · 이도현 10 · 없는 아이디 1, IP당 1~3회). 일부 IP는 두 계정을 번갈아 시도(패스워드 스프레이)
  for (let i = 0; i < 40; i += 1) {
    const target = i % 4 === 3 ? 'dohyun' : 'jiwon'
    add(9 - i * 0.2, target, DISTRIBUTED_IPS[i % 30], 'BAD_PASSWORD', null)
  }
  add(2, 'ghost_admin', DISTRIBUTED_IPS[0], 'UNKNOWN_USER', null)

  return rows
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .map((row, index) => ({ ...row, loginEventId: index + 1 }))
}

export function buildMockStaffSessions(now: Date): StaffSession[] {
  const session = (
    staffSessionId: number,
    loginId: keyof typeof OFFICE_IP,
    ipInfo: IpInfo,
    deviceLabel: string,
    startedMinutesAgo: number,
    ended: boolean,
  ): StaffSession => {
    const found = MOCK_USERS.find((u) => u.loginId === loginId)!
    return {
      staffSessionId,
      userId: found.userId,
      displayName: found.displayName,
      ip: ipInfo,
      deviceId: `DEV-${loginId}-${ipInfo.ipType}`,
      deviceLabel,
      startedAt: minutesAgo(now, startedMinutesAgo),
      lastSeenAt: minutesAgo(now, ended ? startedMinutesAgo - 60 : 1),
      endedAt: ended ? minutesAgo(now, startedMinutesAgo - 60) : null,
      endReason: ended ? 'LOGOUT' : null,
    }
  }
  return [
    // 같은 계정(박지원) 세션이 사내 PC와 해외 Tor IP에서 동시에 쓰이는 장면
    session(1, 'jiwon', OFFICE_IP.jiwon, '업무 PC · Chrome · Windows', 120, false),
    session(2, 'jiwon', ATTACK_IP, 'Unknown · Firefox · Linux', 40, false),
    session(3, 'yunseo', OFFICE_IP.yunseo, '업무 PC · Edge · Windows', 110, false),
    session(4, 'dohyun', OFFICE_IP.dohyun, '업무 PC · Chrome · Windows', 100, false),
    session(5, 'jiwon', HOME_IP, '집 PC · Chrome · Windows', 780, true),
  ]
}

// Mock 로그인 세션 — 서버 쿠키 대신 브라우저 세션 저장소 (node 테스트에서는 메모리)
const SESSION_KEY = 'dw-mock-session-user'
let memorySession: AuthUser | null = null

function saveSession(user: AuthUser | null) {
  memorySession = user
  try {
    if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // 저장소가 없는 환경(node 테스트 · 막힌 브라우저)은 메모리만 쓴다
  }
  // 다른 Mock(사건 · 보고서)이 같은 사람을 현재 사용자로 본다
  if (user) setMockActor({ userId: user.userId, role: user.role, displayName: user.displayName })
}

function loadSession(): AuthUser | null {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (saved) {
      // 새로 고침 뒤에도 다른 Mock이 같은 사람을 현재 사용자로 본다
      const user = JSON.parse(saved) as AuthUser
      setMockActor({ userId: user.userId, role: user.role, displayName: user.displayName })
      return user
    }
  } catch {
    // 저장소가 없으면 메모리 값
  }
  return memorySession
}

function signIn(user: AuthUser): AuthUser {
  const copy = structuredClone(user)
  saveSession(copy)
  return copy
}

// 진행 중인 2단계 인증 요청: challengeId → 사용자 · 틀린 횟수 · 확인 방법
const challenges = new Map<string, { user: AuthUser; failures: number; method: 'OTP' | 'EMAIL' }>()

// 사장님 위험 기반 확인 (1-13, 현규 결정 B): 처음 보는 기기이거나 비밀번호를 5번 이상 틀린 뒤면 이메일 6자리
export const DEMO_EMAIL_CODE = '135790'
export const OWNER_STEP_UP_FAILURES = 5
// 사장님 가입 이메일 (가린 값만 화면에 보낸다)
const OWNER_EMAIL: Record<string, string> = { boss: 'o****@cakeshop.kr' }
// 비밀번호를 연달아 틀린 횟수 (아이디별) · 이번 화면에서 확인을 마친 기기 (새로 고침하면 다시 새 기기)
const passwordFailures = new Map<string, number>()
const knownDevices = new Set<string>()
// OTP를 이만큼 틀리면 계정을 잠근다 (Mock은 이번 요청만 끝냄)
export const MAX_OTP_FAILURES = 5
// 1차 MVP는 비밀번호만으로 로그인 (#102) — 2단계 확인(직원 OTP · 사장님 이메일)은 2차에서 켠다
let secondFactor = false
export function setMockSecondFactor(on: boolean) {
  secondFactor = on
}
// 서버와 같은 규칙: 비밀번호 5번 연속 실패 → 잠금 (Mock은 시간 대신 새로 고침 전까지)
export const MAX_PASSWORD_FAILURES = 5

export async function mockStartLogin(loginId: string, password: string): Promise<LoginStep> {
  await mockRespond(null)
  const id = loginId.trim().toLowerCase()
  const found = MOCK_USERS.find((u) => u.loginId === id)
  if (found && lockedUsers.has(found.userId)) throw new AccountLockedError()
  if (!found || password !== DEMO_PASSWORD) {
    if (found) {
      const failures = (passwordFailures.get(id) ?? 0) + 1
      passwordFailures.set(id, failures)
      if (!secondFactor && failures >= MAX_PASSWORD_FAILURES) {
        passwordFailures.delete(id)
        lockedUsers.set(found.userId, '비밀번호를 5번 틀려 잠김')
      }
    }
    throw new InvalidCredentialsError()
  }
  if (!secondFactor) {
    passwordFailures.delete(id)
    return { status: 'SUCCESS', user: signIn(found) }
  }
  const challengeId = `mock-${found.loginId}-${Date.now()}`
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
  if (needsOtp(found)) {
    challenges.set(challengeId, { user: found, failures: 0, method: 'OTP' })
    return { status: 'OTP_REQUIRED', challengeId, expiresAt, method: 'OTP' }
  }
  // 사장님: 평소엔 바로 끝, 위험할 때만 이메일 확인
  const reason =
    (passwordFailures.get(id) ?? 0) >= OWNER_STEP_UP_FAILURES
      ? 'FAILED_ATTEMPTS'
      : !knownDevices.has(id)
        ? 'NEW_DEVICE'
        : null
  if (!reason) return { status: 'SUCCESS', user: signIn(found) }
  challenges.set(challengeId, { user: found, failures: 0, method: 'EMAIL' })
  return {
    status: 'OTP_REQUIRED',
    challengeId,
    expiresAt,
    method: 'EMAIL',
    sentTo: OWNER_EMAIL[id] ?? '가입한 이메일',
    reason,
  }
}

async function finishChallenge(challengeId: string, ok: boolean): Promise<AuthUser> {
  await mockRespond(null)
  const found = challenges.get(challengeId)
  if (!found) throw new InvalidOtpError()
  if (!ok) {
    found.failures += 1
    if (found.failures >= MAX_OTP_FAILURES) {
      challenges.delete(challengeId)
      lockedUsers.set(found.user.userId, 'OTP를 5번 틀려 잠김')
      throw new AccountLockedError()
    }
    throw new InvalidOtpError()
  }
  challenges.delete(challengeId)
  // 확인을 마치면 실패 횟수를 지우고 이 기기를 기억한다
  passwordFailures.delete(found.user.loginId)
  knownDevices.add(found.user.loginId)
  return signIn(found.user)
}

// 6자리 확인 — 인증 앱(OTP) 또는 이메일 코드
export const mockVerifyOtp = (challengeId: string, code: string) => {
  const method = challenges.get(challengeId)?.method
  return finishChallenge(
    challengeId,
    code.trim() === (method === 'EMAIL' ? DEMO_EMAIL_CODE : DEMO_OTP),
  )
}

export const mockSubmitRecoveryCode = (challengeId: string, recoveryCode: string) =>
  finishChallenge(challengeId, recoveryCode.trim().toUpperCase() === DEMO_RECOVERY_CODE)

// 재인증 표: 5분 · 한 번만 (토큰 → 사용자 · 만료 시각)
const reauthTickets = new Map<string, { userId: number; expiresAt: number }>()
const REAUTH_MINUTES = 5

// 1차 MVP: 비밀번호를 다시 넣는다 (#102)
export async function mockReauth(password: string): Promise<ReauthTicket> {
  await mockRespond(null)
  const user = loadSession()
  if (!user) throw new ApiError(401, 'AUTH_001')
  if (password !== DEMO_PASSWORD) throw new ReauthPasswordError()
  const expiresAt = Date.now() + REAUTH_MINUTES * 60_000
  const reauthToken = `mock-reauth-${user.userId}-${Date.now()}`
  reauthTickets.set(reauthToken, { userId: user.userId, expiresAt })
  return { reauthToken, expiresAt: new Date(expiresAt).toISOString() }
}

// 사건 Mock이 판정할 때 쓴다: 맞는 사람의 유효한 표면 true, 쓰면 사라진다
export function mockConsumeReauth(
  token: string | null | undefined,
  userId: number,
  now = Date.now(),
) {
  if (!token) return false
  const found = reauthTickets.get(token)
  reauthTickets.delete(token)
  return Boolean(found && found.userId === userId && found.expiresAt > now)
}

// 로그인하지 않았으면 실제 서버처럼 401
export async function mockGetMe(): Promise<AuthUser> {
  await mockRespond(null, 100)
  const user = loadSession()
  if (!user) throw new ApiError(401, 'AUTH_001')
  return structuredClone(user)
}

export async function mockLogout(): Promise<void> {
  await mockRespond(null, 100)
  saveSession(null)
}

export function mockGetLoginEvents(query: LoginEventQuery = {}): Promise<StaffLoginEvent[]> {
  const rows = buildMockLoginEvents(mockEpoch()).filter(
    (row) =>
      (!query.loginId || row.loginIdAttempted === query.loginId) &&
      (!query.ip || row.ip.address === query.ip) &&
      (!query.result || row.result === query.result) &&
      (!query.from || row.occurredAt >= query.from) &&
      (!query.to || row.occurredAt <= query.to),
  )
  return mockRespond(rows)
}

// 화면에서 바꾼 것 (세션 종료 · 잠금 해제)은 새로고침 전까지만 남는다
const terminated = new Map<number, string>()
// 분산 공격 때 이도현 계정이 비밀번호 실패 반복으로 잠긴 장면
const INITIAL_LOCKS: [number, string][] = [[6, '비밀번호를 짧은 시간에 여러 번 틀려 잠김']]
const lockedUsers = new Map<number, string>(INITIAL_LOCKS)

export function resetMockIdentity() {
  terminated.clear()
  lockedUsers.clear()
  for (const [userId, reason] of INITIAL_LOCKS) lockedUsers.set(userId, reason)
  challenges.clear()
  passwordFailures.clear()
  knownDevices.clear()
  secondFactor = false
  saveSession(null)
}

function sessionsNow(): StaffSession[] {
  return buildMockStaffSessions(mockEpoch()).map((s) => {
    const endedAt = terminated.get(s.staffSessionId)
    return endedAt && s.endedAt === null ? { ...s, endedAt, endReason: 'FORCED' } : s
  })
}

export function mockGetStaffSessions(activeOnly = true): Promise<StaffSession[]> {
  const rows = sessionsNow()
  return mockRespond(activeOnly ? rows.filter((row) => row.endedAt === null) : rows)
}

const WORK_PC: Record<string, IpInfo> = OFFICE_IP

// 직원(보안 직원 · 관리자) 계정 목록 — 마지막 로그인은 로그인 기록의 마지막 성공
export function buildMockStaffAccounts(now: Date): StaffAccount[] {
  const events = buildMockLoginEvents(now)
  return MOCK_USERS.filter(needsOtp).map((u) => {
    const last = events.find((e) => e.userId === u.userId && e.result === 'SUCCESS') ?? null
    return {
      userId: u.userId,
      displayName: u.displayName,
      role: u.role,
      locked: lockedUsers.has(u.userId),
      lockedReason: lockedUsers.get(u.userId) ?? null,
      // 팀 시드의 테스트 계정은 OTP · 업무 PC가 없다
      otpEnrolled: u.loginId in WORK_PC,
      workPc: WORK_PC[u.loginId] ?? null,
      lastLoginAt: last?.occurredAt ?? null,
      lastLoginOutside: last ? last.ip.ipType !== 'OFFICE' : false,
    }
  })
}

export function mockGetStaffAccounts(): Promise<StaffAccount[]> {
  return mockRespond(buildMockStaffAccounts(mockEpoch()))
}

const requireManager = () => {
  if (getMockActor().role !== 'SECURITY_MANAGER') throw new StaffActionForbiddenError()
}

export async function mockTerminateStaffSession(staffSessionId: number): Promise<StaffSession> {
  requireManager()
  const found = sessionsNow().find((s) => s.staffSessionId === staffSessionId)
  if (!found || found.endedAt !== null) throw new StaffActionDoneError()
  terminated.set(staffSessionId, new Date().toISOString())
  mockRecordStaffAction(found.userId, 'KILL_SESSIONS')
  return mockRespond(sessionsNow().find((s) => s.staffSessionId === staffSessionId)!)
}

export async function mockUnlockStaffAccount(userId: number): Promise<StaffAccount> {
  requireManager()
  if (!lockedUsers.has(userId)) throw new StaffActionDoneError()
  lockedUsers.delete(userId)
  return mockRespond(buildMockStaffAccounts(mockEpoch()).find((a) => a.userId === userId)!)
}
