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

function DemoSession() {
  const { loggedIn } = useDemo()
  return loggedIn ? <AdminLayout /> : <Navigate to="/demo/login" replace />
}

// ADMIN · 보안 직원 · 사장님은 서버 세션으로, 컴포넌트 목록 같은 개발 화면은 DemoSession으로 진입한다.
// 서버 인가는 #68 5단계다.
export const router = createBrowserRouter([
  // 로그인 화면이 로그인된 사용자를 역할별 첫 화면으로 보낸다.
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginRoute /> },
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
          { path: 'home', element: <EmptyPage title="홈" slice="1-11" /> },
          { path: 'rules', element: <EmptyPage title="Rule 카탈로그" slice="1-3" /> },
          { path: 'alerts', element: <AlertListPage /> },
          { path: 'alerts/:id', element: <AlertDetailPage /> },
          { path: 'blocklist', element: <EmptyPage title="차단 목록" slice="1-4" /> },
          { path: 'cases', element: <CaseListPage /> },
          { path: 'cases/:id', element: <CaseDetailPage /> },
          { path: 'actions', element: <EmptyPage title="조치 센터" slice="1-6" /> },
          { path: 'notifications', element: <EmptyPage title="메일 발송 기록" slice="1-8" /> },
          // 예전 첫 화면 주소로 들어와도 홈으로 보낸다
          { path: 'transactions', element: <Navigate to="/security/home" replace /> },
          { path: '*', element: <ScreenResult kind="404" homePath="/security" /> },
        ],
      },
      {
        path: '/manager',
        children: [
          { path: 'home', element: <EmptyPage title="홈" slice="1-11" /> },
          { path: 'approvals', element: <EmptyPage title="2인 승인함" slice="1-6" /> },
          { path: 'rules', element: <EmptyPage title="Rule 카탈로그" slice="1-3" /> },
          { path: 'access', element: <EmptyPage title="직원 접속 감시" slice="1-2" /> },
          { path: 'cases', element: <EmptyPage title="사건 목록" slice="1-5" /> },
          { path: 'audit', element: <EmptyPage title="감사 로그" slice="1-6" /> },
          { path: '*', element: <ScreenResult kind="404" homePath="/manager" /> },
        ],
      },
      {
        path: '/owner',
        children: [
          { path: 'home', element: <EmptyPage title="홈" slice="1-11" /> },
          { path: 'results', element: <EmptyPage title="보안 확인 결과" slice="1-8" /> },
          { path: 'settlements', element: <EmptyPage title="정산 캘린더" slice="1-10" /> },
          { path: 'funds', element: <EmptyPage title="자금 현황" slice="1-10" /> },
          { path: 'loans', element: <EmptyPage title="연계 대출 상품" slice="1-10" /> },
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
