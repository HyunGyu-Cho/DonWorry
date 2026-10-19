import { useContext } from 'react'
import { AuthContext } from '../app/auth-context'
import type { AuthState } from '../app/auth-context'

export function useAuth(): AuthState {
  const state = useContext(AuthContext)
  if (!state) {
    throw new Error('useAuth 는 AuthProvider 안에서만 쓸 수 있다')
  }
  return state
}
