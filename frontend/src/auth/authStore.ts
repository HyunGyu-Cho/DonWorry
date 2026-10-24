import { advanceApiSession, ApiError } from '../api/client.ts'
import type { AuthUser, LoginStep } from '../types/auth.ts'

// 화면은 api/identity.ts를 넘긴다 (Mock · 실제 전환). 테스트는 가짜를 넘긴다
export type AuthApi = {
  startLogin: (loginId: string, password: string) => Promise<LoginStep>
  verifyOtp: (challengeId: string, code: string) => Promise<AuthUser>
  submitRecoveryCode: (challengeId: string, recoveryCode: string) => Promise<AuthUser>
  getMe: () => Promise<AuthUser>
  logout: () => Promise<void>
}

// 로그인 1단계 결과: 끝났거나, OTP가 남았거나
export type LoginProgress = { done: true } | { done: false; challengeId: string; expiresAt: string }
export type AuthState = {
  user: AuthUser | null
  status: 'loading' | 'authenticated' | 'anonymous'
  checkedKey: string | null
  error: 'unavailable' | 'forbidden' | null
  expired: boolean
  loggingOut: boolean
}

export function createAuthStore(api: AuthApi) {
  let state: AuthState = {
    user: null,
    status: 'loading',
    checkedKey: null,
    error: null,
    expired: false,
    loggingOut: false,
  }
  let generation = 0
  let pendingCheck: { key: string; promise: Promise<void> } | null = null
  let pendingLogout: Promise<void> | null = null
  let lastCheckKey: string | null = null
  const listeners = new Set<() => void>()
  const update = (patch: Partial<AuthState>) => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }
  const invalidate = () => {
    generation += 1
    pendingCheck = null
    advanceApiSession()
  }
  const expire = () => {
    if (!state.user) return
    invalidate()
    update({ user: null, status: 'anonymous', checkedKey: null, error: null, expired: true })
  }

  // 로그인이 끝난 사용자를 반영한다. 그 사이 로그아웃 · 다른 로그인이 있었으면 버린다
  function complete(user: AuthUser, currentGeneration: number) {
    if (currentGeneration !== generation) return
    advanceApiSession()
    update({ user, status: 'authenticated', checkedKey: null, error: null, expired: false })
  }

  function check(key: string): Promise<void> {
    lastCheckKey = key
    if (pendingLogout)
      return pendingLogout.then(
        () => check(key),
        () => check(key),
      )
    if (pendingCheck?.key === key) return pendingCheck.promise
    const currentGeneration = generation
    const request = { key, promise: Promise.resolve() }
    pendingCheck = request
    update({ error: null, checkedKey: null })
    request.promise = (async () => {
      try {
        const user = await api.getMe()
        if (currentGeneration !== generation || pendingCheck !== request) return
        update({ user, status: 'authenticated', checkedKey: key, error: null })
      } catch (error) {
        if (currentGeneration !== generation || pendingCheck !== request) return
        if (error instanceof ApiError && error.status === 401) {
          const expired = state.user !== null
          invalidate()
          update({ user: null, status: 'anonymous', checkedKey: key, error: null, expired })
        } else {
          update({
            checkedKey: key,
            error: error instanceof ApiError && error.status === 403 ? 'forbidden' : 'unavailable',
          })
        }
      } finally {
        if (pendingCheck === request) pendingCheck = null
      }
    })()
    return request.promise
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    expire,
    consumeExpired: () => update({ expired: false }),
    check,
    // 1단계: 사장님은 여기서 끝, 직원은 OTP가 남는다
    login: async (loginId: string, password: string): Promise<LoginProgress> => {
      if (pendingLogout) await pendingLogout
      invalidate()
      const currentGeneration = generation
      const step = await api.startLogin(loginId, password)
      if (step.status === 'OTP_REQUIRED') {
        return { done: false, challengeId: step.challengeId, expiresAt: step.expiresAt }
      }
      complete(step.user, currentGeneration)
      return { done: true }
    },
    // 2단계: 인증 앱의 6자리 코드
    verifyOtp: async (challengeId: string, code: string) => {
      const currentGeneration = generation
      complete(await api.verifyOtp(challengeId, code), currentGeneration)
    },
    // 인증 앱을 잃었을 때 1회용 복구 코드
    submitRecoveryCode: async (challengeId: string, recoveryCode: string) => {
      const currentGeneration = generation
      complete(await api.submitRecoveryCode(challengeId, recoveryCode), currentGeneration)
    },
    logout: (): Promise<void> => {
      if (pendingLogout) return pendingLogout
      invalidate()
      const currentGeneration = generation
      update({ loggingOut: true })
      pendingLogout = (async () => {
        try {
          await api.logout()
          if (currentGeneration !== generation) return
          invalidate()
          update({ user: null, status: 'anonymous', checkedKey: null, error: null, expired: false })
        } catch (error) {
          // 시작할 때 버린 경로 확인을 다시 해 로딩에 갇히지 않게 한다.
          pendingLogout = null
          if (currentGeneration === generation && state.checkedKey === null && lastCheckKey)
            void check(lastCheckKey)
          throw error
        } finally {
          pendingLogout = null
          update({ loggingOut: false })
        }
      })()
      return pendingLogout
    },
  }
}
