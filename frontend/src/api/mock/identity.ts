// P1 identity Mock — 시드(migration)와 같은 계정 · 가짜 IP를 쓴다 (docs/erd 7절)
// 테스트가 직접 불러오므로 import.meta.env를 읽는 mockMode는 쓰지 않는다
import { InvalidCredentialsError, InvalidOtpError } from '../auth.ts'
import { mockRespond } from './respond.ts'
import type {
  AuthUser,
  IpInfo,
  LoginEventQuery,
  LoginStep,
  StaffLoginEvent,
  StaffSession,
} from '../../types/auth.ts'

export const DEMO_OTP = '246810'
export const DEMO_RECOVERY_CODE = 'DW-RECOVERY-0001'
const DEMO_PASSWORD = '1234'

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
// 분산 공격 IP 30개 (대역 5곳 × 6)
export const DISTRIBUTED_IPS: IpInfo[] = Array.from({ length: 30 }, (_, i) => {
  const [net, country] = DIST_NETS[i % 5]
  return ip(net + (17 + ((i * 7) % 200)), country, 'FOREIGN', `분산 공격 IP 묶음 ${net}x`)
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
  for (const day of [3, 2, 1]) {
    add(day * 1440, 'jiwon', OFFICE_IP.jiwon, 'SUCCESS', '업무 PC · Chrome · Windows')
    add(day * 1440 - 7, 'yunseo', OFFICE_IP.yunseo, 'SUCCESS', '업무 PC · Edge · Windows')
    add(day * 1440 - 12, 'dohyun', OFFICE_IP.dohyun, 'SUCCESS', '업무 PC · Chrome · Windows')
  }
  // 직원 계정 탈취: 집에서 로그인(새 기기) → 해외 Tor IP에서 비밀번호 성공 후 OTP 3회 실패
  add(780, 'jiwon', HOME_IP, 'SUCCESS', '집 PC · Chrome · Windows')
  for (const m of [95, 94, 93]) add(m, 'jiwon', ATTACK_IP, 'BAD_OTP', 'Unknown · Firefox · Linux')
  // 분산 공격: 10분 안에 IP 30개에서 실패 40회. 일부 IP는 두 계정을 번갈아 시도(비밀번호 뿌리기)
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

// 진행 중인 2단계 인증 요청: challengeId → 사용자
const challenges = new Map<string, AuthUser>()

export async function mockStartLogin(loginId: string, password: string): Promise<LoginStep> {
  await mockRespond(null)
  const found = MOCK_USERS.find((u) => u.loginId === loginId.trim().toLowerCase())
  if (!found || password !== DEMO_PASSWORD) throw new InvalidCredentialsError()
  if (!needsOtp(found)) return { status: 'SUCCESS', user: structuredClone(found) }
  const challengeId = `mock-${found.loginId}-${challenges.size + 1}`
  challenges.set(challengeId, found)
  return {
    status: 'OTP_REQUIRED',
    challengeId,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  }
}

async function finishChallenge(challengeId: string, ok: boolean): Promise<AuthUser> {
  await mockRespond(null)
  const found = challenges.get(challengeId)
  if (!found || !ok) throw new InvalidOtpError()
  challenges.delete(challengeId)
  return structuredClone(found)
}

export const mockVerifyOtp = (challengeId: string, code: string) =>
  finishChallenge(challengeId, code.trim() === DEMO_OTP)

export const mockSubmitRecoveryCode = (challengeId: string, recoveryCode: string) =>
  finishChallenge(challengeId, recoveryCode.trim().toUpperCase() === DEMO_RECOVERY_CODE)

export function mockGetLoginEvents(query: LoginEventQuery = {}): Promise<StaffLoginEvent[]> {
  const rows = buildMockLoginEvents(new Date()).filter(
    (row) =>
      (!query.loginId || row.loginIdAttempted === query.loginId) &&
      (!query.ip || row.ip.address === query.ip) &&
      (!query.result || row.result === query.result) &&
      (!query.from || row.occurredAt >= query.from) &&
      (!query.to || row.occurredAt <= query.to),
  )
  return mockRespond(rows)
}

export function mockGetStaffSessions(activeOnly = true): Promise<StaffSession[]> {
  const rows = buildMockStaffSessions(new Date())
  return mockRespond(activeOnly ? rows.filter((row) => row.endedAt === null) : rows)
}
