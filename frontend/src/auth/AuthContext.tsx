import { useEffect, useState, type ReactNode } from 'react'
import { subscribeUnauthorized } from '../api/client'
import * as identityApi from '../api/identity'
import { createAuthStore } from './authStore'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createAuthStore(identityApi))
  useEffect(() => subscribeUnauthorized(store.expire), [store])
  return <AuthContext.Provider value={store}>{children}</AuthContext.Provider>
}
