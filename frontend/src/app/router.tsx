import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { LoginPage } from '../pages/auth/LoginPage'
import { CaseDetailPage } from '../pages/security/CaseDetailPage'
import { CaseListPage } from '../pages/security/CaseListPage'
import { LoginSecurityPage } from '../pages/security/LoginSecurityPage'
import { CashflowPage } from '../pages/merchant/CashflowPage'
import { DashboardPage } from '../pages/merchant/DashboardPage'
import { PaymentDetailPage } from '../pages/merchant/PaymentDetailPage'
import { PaymentsPage } from '../pages/merchant/PaymentsPage'
import { SettlementsPage } from '../pages/merchant/SettlementsPage'
import { MerchantsPage } from '../pages/admin/MerchantsPage'
import { UsersPage } from '../pages/admin/UsersPage'
import { RequireRole } from './RequireRole'
import { useAuth } from '../hooks/useAuth'

/** 역할별 첫 화면. CS-01·02 는 CakeShop 소유라 여기 없다. */
function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <p>확인 중…</p>
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'SECURITY_STAFF') return <Navigate to="/security/cases" replace />
  if (user.role === 'MERCHANT_OWNER') return <Navigate to="/merchant" replace />
  return <Navigate to="/admin/merchants" replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route index element={<HomeRedirect />} />

        <Route element={<RequireRole allow={['SECURITY_STAFF']} />}>
          <Route path="security/cases" element={<CaseListPage />} />
          <Route path="security/cases/:caseId" element={<CaseDetailPage />} />
          <Route path="security/login-events" element={<LoginSecurityPage />} />
        </Route>

        <Route element={<RequireRole allow={['MERCHANT_OWNER']} />}>
          <Route path="merchant" element={<DashboardPage />} />
          <Route path="merchant/payments" element={<PaymentsPage />} />
          <Route path="merchant/payments/:paymentId" element={<PaymentDetailPage />} />
          <Route path="merchant/settlements" element={<SettlementsPage />} />
          <Route path="merchant/cashflow" element={<CashflowPage />} />
        </Route>

        <Route element={<RequireRole allow={['PLATFORM_ADMIN']} />}>
          <Route path="admin/merchants" element={<MerchantsPage />} />
          <Route path="admin/users" element={<UsersPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
