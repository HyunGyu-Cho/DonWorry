import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/** 02-2: 공용 UI. 역할에 따라 보이는 메뉴만 바뀐다. */
export function Layout() {
  const { user, signOut } = useAuth()

  return (
    <div>
      <header>
        <strong>DonWorry</strong>
        <nav>
          {user?.role === 'SECURITY_STAFF' && (
            <>
              <Link to="/security/cases">Case 목록</Link>
              <Link to="/security/login-events">로그인 보안</Link>
            </>
          )}
          {user?.role === 'MERCHANT_OWNER' && (
            <>
              <Link to="/merchant">대시보드</Link>
              <Link to="/merchant/payments">결제 내역</Link>
              <Link to="/merchant/settlements">정산</Link>
              <Link to="/merchant/cashflow">자금관리</Link>
            </>
          )}
          {user?.role === 'PLATFORM_ADMIN' && (
            <>
              <Link to="/admin/merchants">가맹점</Link>
              <Link to="/admin/users">사용자·권한</Link>
            </>
          )}
        </nav>
        {user && (
          <button type="button" onClick={() => void signOut()}>
            로그아웃 ({user.email})
          </button>
        )}
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
