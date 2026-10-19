import { createContext } from 'react'
import type { CurrentUser } from '../types'

export interface AuthState {
  user: CurrentUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

/** 컴포넌트가 아닌 값만 두는 파일 (react-refresh 경고 회피) */
export const AuthContext = createContext<AuthState | null>(null)
