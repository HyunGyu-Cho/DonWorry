import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import type { Role } from '../types'

/** 권한별 라우트 가드. 서버 인가가 정본이고 이건 화면 전환용이다. */
export function RequireRole({ allow }: { allow: Role[] }) {
  const { user, loading } = useAuth()

  if (loading) return <p>확인 중…</p>
  if (!user) return <Navigate to="/login" replace />
  if (!allow.includes(user.role)) return <Navigate to="/" replace />

  return <Outlet />
}
