import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import * as authApi from '../api/auth'
import type { CurrentUser } from '../types'
import { AuthContext } from './auth-context'
import type { AuthState } from './auth-context'

/**
 * 02-2: App·Router·인증 경계.
 * 화면 가드는 편의일 뿐이고 실제 인가는 서버가 다시 검증한다 (DEC-13, TEST-05).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    authApi
      .me()
      .then((loaded) => {
        if (active) setUser(loaded)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setUser(await authApi.login(email, password))
  }, [])

  const signOut = useCallback(async () => {
    await authApi.logout()
    setUser(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
