// 값은 백엔드 enum · DB 값과 같은 문자열을 쓴다 (docs/erd 7절)
export type UserRole = 'ADMIN' | 'OPERATOR' | 'SECURITY_STAFF' | 'SECURITY_MANAGER'

export type AuthUser = {
  userId: number
  loginId: string
  displayName: string
  role: UserRole
  merchantId: number | null
  tenantScope: 'ALL' | null
  permissions: string[]
}

// 로그인 1단계(아이디 · 비밀번호) 결과. 직원은 2단계 인증(OTP)이 남고, 사장님은 바로 끝난다
export type LoginStep =
  | { status: 'OTP_REQUIRED'; challengeId: string; expiresAt: string }
  | { status: 'SUCCESS'; user: AuthUser }

// staff_login_events.result
export type LoginResult = 'SUCCESS' | 'BAD_PASSWORD' | 'BAD_OTP' | 'LOCKED' | 'UNKNOWN_USER'

// demo_fake_ips.ip_type (OFFICE = 사내망)
export type IpType = 'OFFICE' | 'DOMESTIC' | 'FOREIGN' | 'ANONYMOUS'

export type IpInfo = {
  address: string
  countryCode: string
  ipType: IpType
  label: string
}

// 직원 로그인 시도 1건 (성공 · 실패 모두)
export type StaffLoginEvent = {
  loginEventId: number
  userId: number | null
  loginIdAttempted: string
  ip: IpInfo
  deviceId: string | null
  deviceLabel: string | null
  result: LoginResult
  occurredAt: string
}

export type LoginEventQuery = {
  from?: string
  to?: string
  loginId?: string
  ip?: string
  result?: LoginResult
}

export type SessionEndReason = 'LOGOUT' | 'EXPIRED' | 'FORCED'

// 직원 접속 세션. endedAt이 null이면 진행 중
export type StaffSession = {
  staffSessionId: number
  userId: number
  displayName: string
  ip: IpInfo
  deviceId: string | null
  deviceLabel: string | null
  startedAt: string
  lastSeenAt: string
  endedAt: string | null
  endReason: SessionEndReason | null
}

// 직원 계정 목록 (직원 접속 감시 · 직원 정보 탭, 1-2)
export type StaffAccount = {
  userId: number
  displayName: string
  role: UserRole
  locked: boolean
  // 잠긴 이유 한 문장 (잠기지 않았으면 null)
  lockedReason: string | null
  otpEnrolled: boolean
  // 등록된 업무 PC — 서버가 준 설명만 (IP 원문은 workPc.address로 펼치기 안에서만)
  workPc: IpInfo | null
  lastLoginAt: string | null
  // 마지막 로그인이 사내망 밖이었는지
  lastLoginOutside: boolean
}
