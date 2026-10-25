import { createBrowserRouter, Navigate } from 'react-router-dom'
import { useDemo } from '../demo/DemoContext'
import { AdminLayout } from '../layouts/AdminLayout'
import { ScreenResult } from '../components/common/ScreenResult'
import { ComponentShowcasePage } from '../pages/demo/ComponentShowcasePage'
import { LoginRoute, ServerSession } from '../auth/AuthRoutes'
import { DemoLoginPage } from '../pages/demo/DemoLoginPage'
import { EmptyPage } from '../pages/EmptyPage'
import { CaseDetailPage } from '../pages/security/CaseDetailPage'
import { CaseListPage } from '../pages/security/CaseListPage'
import { AlertDetailPage } from '../pages/security/AlertDetailPage'
import { AlertListPage } from '../pages/security/AlertListPage'
import { StaffAccessPage } from '../pages/manager/StaffAccessPage'
import { RuleCatalogPage } from '../pages/security/RuleCatalogPage'
import { BlocklistPage } from '../pages/security/BlocklistPage'
import { ReportPage } from '../pages/security/ReportPage'
import { NotificationsPage } from '../pages/security/NotificationsPage'
import { OwnerResultsPage } from '../pages/owner/OwnerResultsPage'
import { OwnerHomePage } from '../pages/owner/OwnerHomePage'
import { SecurityHomePage } from '../pages/security/SecurityHomePage'
import { ManagerHomePage } from '../pages/manager/ManagerHomePage'
import { LandingPage } from '../pages/public/LandingPage'
import { SettlementCalendarPage } from '../pages/owner/SettlementCalendarPage'
import { FundsPage } from '../pages/owner/FundsPage'
import { LoanProductsPage } from '../pages/owner/LoanProductsPage'
import { BuyerConfirmPage } from '../pages/public/BuyerConfirmPage'
import { CheckoutPage } from '../pages/public/CheckoutPage'
import { TestShopPage, TestShopResultPage } from '../pages/public/TestShopPage'
import { ActionCenterPage } from '../pages/security/ActionCenterPage'
import { ApprovalsPage } from '../pages/manager/ApprovalsPage'
import { AuditLogPage } from '../pages/manager/AuditLogPage'

function DemoSession() {
  const { loggedIn } = useDemo()
  return loggedIn ? <AdminLayout /> : <Navigate to="/demo/login" replace />
}

// ADMIN · 보안 직원 · 사장님은 서버 세션으로, 컴포넌트 목록 같은 개발 화면은 DemoSession으로 진입한다.
// 서버 인가는 #68 5단계다.
export const router = createBrowserRouter([
  // 로그인 화면이 로그인된 사용자를 역할별 첫 화면으로 보낸다.
  // 랜딩 — 서비스 소개 + 시연 시나리오 고르기 (로그인 없이)
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginRoute /> },
  // 구매자 본인 확인 — 로그인 없이 메일 속 1회용 링크로 연다
  { path: '/confirm/:token', element: <BuyerConfirmPage /> },
  // 돈워리 결제창 · 시연용 테스트 상점 — 로그인 없이 연다
  { path: '/checkout/:token', element: <CheckoutPage /> },
  { path: '/demo/shop', element: <TestShopPage /> },
  { path: '/demo/shop/result', element: <TestShopResultPage /> },
  // 가드보다 먼저 이동해 /me 확인을 한 번만 한다. 사장님 첫 화면은 권한에 따라 달라 가드에서 정한다.
  { path: '/admin', element: <Navigate to="/admin/fds" replace /> },
  {
    element: <ServerSession />,
    children: [
      {
        path: '/admin',
        children: [
          { path: 'fds', element: <EmptyPage title="FDS" /> },
          { path: 'finance', element: <EmptyPage title="자금관리" /> },
          { path: '*', element: <ScreenResult kind="404" homePath="/admin" /> },
        ],
      },
      {
        path: '/security',
        children: [
          { path: 'home', element: <SecurityHomePage /> },
          { path: 'rules', element: <RuleCatalogPage /> },
          { path: 'alerts', element: <AlertListPage /> },
          { path: 'alerts/:id', element: <AlertDetailPage /> },
          { path: 'blocklist', element: <BlocklistPage /> },
          { path: 'cases', element: <CaseListPage /> },
          { path: 'cases/:id', element: <CaseDetailPage /> },
          { path: 'cases/:id/report', element: <ReportPage /> },
          { path: 'actions', element: <ActionCenterPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          // 예전 첫 화면 주소로 들어와도 홈으로 보낸다
          { path: 'transactions', element: <Navigate to="/security/home" replace /> },
          { path: '*', element: <ScreenResult kind="404" homePath="/security" /> },
        ],
      },
      {
        path: '/manager',
        children: [
          { path: 'home', element: <ManagerHomePage /> },
          { path: 'approvals', element: <ApprovalsPage /> },
          { path: 'rules', element: <RuleCatalogPage /> },
          { path: 'access', element: <StaffAccessPage /> },
          { path: 'cases', element: <CaseListPage scope="staff" /> },
          { path: 'cases/:id', element: <CaseDetailPage /> },
          { path: 'cases/:id/report', element: <ReportPage /> },
          { path: 'audit', element: <AuditLogPage /> },
          { path: '*', element: <ScreenResult kind="404" homePath="/manager" /> },
        ],
      },
      {
        path: '/owner',
        children: [
          { path: 'home', element: <OwnerHomePage /> },
          { path: 'results', element: <OwnerResultsPage /> },
          { path: 'settlements', element: <SettlementCalendarPage /> },
          { path: 'funds', element: <FundsPage /> },
          { path: 'loans', element: <LoanProductsPage /> },
          { path: '*', element: <ScreenResult kind="404" homePath="/owner" /> },
        ],
      },
    ],
  },
  { path: '/demo/login', element: <DemoLoginPage /> },
  {
    element: <DemoSession />,
    children: [
      { path: '/dev/components', element: <ComponentShowcasePage /> },
      { path: '*', element: <ScreenResult kind="404" /> },
    ],
  },
])
