import {
  BellOutlined,
  DownOutlined,
  LogoutOutlined,
  MenuOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Button, Select, Tooltip } from 'antd'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { navTour } from '../utils/tutorialView'
import { navByRole, roles, type Role, type NavGroup } from '../config/navigation'
import { useDemo } from '../demo/DemoContext'
import { useFeedback } from '../components/common/Feedback'
import { ScreenErrorBoundary } from '../components/common/ScreenErrorBoundary'
import { MockBadge } from '../components/common/MockBadge'
import { ModeSwitch } from '../components/explain/ModeSwitch'

function Header() {
  const { role, merchant, setRole, setMerchant, logout } = useDemo()
  const navigate = useNavigate()
  const { toast } = useFeedback()
  return (
    <header className="dw-header">
      <NavLink to={roles[role].landing} className="dw-brand" aria-label="돈워리 홈">
        돈워리
      </NavLink>
      <div className="dw-header-center" />
      <div className="dw-header-tools">
        <MockBadge />
        <ModeSwitch />
        <span className="dw-muted-label">가맹점</span>
        {role === 'security' ? (
          <Select
            aria-label="조회 가맹점"
            value={merchant}
            style={{ width: 118 }}
            options={[
              { value: 'CakeShop', label: 'CakeShop' },
              { value: 'DemoMart', label: 'DemoMart' },
            ]}
            onChange={setMerchant}
          />
        ) : (
          <span className="dw-user-name">CakeShop</span>
        )}
        <Tooltip title="알림: 실제 서버 연동 전">
          <Button
            aria-label="알림"
            type="text"
            shape="circle"
            icon={<BellOutlined style={{ fontSize: 19, color: '#64748b' }} />}
            onClick={() => toast.info('알림 기능은 아직 연결되지 않았습니다.')}
          />
        </Tooltip>
        <span className="dw-user-name">{roles[role].userName}</span>
        <span className="dw-role-pill">{roles[role].label}</span>
        <Tooltip title="실제 권한 변경이 아닌 개발용 시연 역할 전환">
          <Select
            aria-label="시연 역할 전환"
            value={role}
            style={{ width: 116 }}
            suffixIcon={<DownOutlined />}
            options={[
              { value: 'security', label: '보안 직원' },
              { value: 'owner', label: '사장님' },
            ]}
            onChange={(v) => {
              setRole(v as Role)
              navigate(roles[v as Role].landing)
            }}
          />
        </Tooltip>
        <Button
          icon={<LogoutOutlined />}
          onClick={() => {
            logout()
            navigate('/demo/login')
          }}
        >
          로그아웃
        </Button>
      </div>
    </header>
  )
}

interface SidebarProps {
  groups: NavGroup[]
  demo?: boolean
  // 좁은 화면에서 ☰로 연 상태
  open?: boolean
  onNavigate?: () => void
}

function Sidebar({ groups, demo = false, open = false, onNavigate }: SidebarProps) {
  const location = useLocation()

  return (
    <aside id="dw-sidebar" className={`dw-sidebar${open ? ' is-open' : ''}`} aria-label="주 메뉴">
      <nav>
        {groups.map((group) => (
          <div className="dw-nav-group" key={group.title}>
            <div className="dw-nav-heading">{group.title}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                data-tour={navTour(item.path)}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `dw-nav-link${isActive || location.pathname.startsWith(item.path + '/') ? ' active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      {demo && (
        <div className="dw-sidebar-bottom">
          <div className="dw-sidebar-tip">
            <strong>공통 관리 화면 v1.0</strong>
            <div>프론트 디자인 시스템 샘플</div>
            <div style={{ marginTop: 5 }}>API 미연결 · 로컬 시연 데이터</div>
            <NavLink
              to="/dev/components"
              style={{
                display: 'inline-flex',
                color: '#BFDBFE',
                marginTop: 8,
                textDecoration: 'underline',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <SettingOutlined /> UI 컴포넌트 보기
            </NavLink>
          </div>
        </div>
      )}
    </aside>
  )
}

export function AdminLayout() {
  const { role } = useDemo()
  return <ManagementLayout header={<Header />} groups={navByRole[role]} demo />
}

export function ManagementLayout({
  header,
  groups,
  demo = false,
  children,
}: {
  header: ReactNode
  groups: NavGroup[]
  demo?: boolean
  children?: ReactNode
}) {
  const location = useLocation()
  // 1024px 미만에서는 메뉴가 ☰ 버튼 속으로 들어간다 (넓은 화면에서는 이 값과 상관없이 늘 보임)
  const [menuOpen, setMenuOpen] = useState(false)
  // 다른 화면으로 가면 맨 위부터 보이게 (이전 화면의 스크롤 위치가 남지 않게)
  // 데이터가 늦게 와서 화면이 길어져도 밀리지 않게, 그린 뒤에도 한 번 더
  useEffect(() => {
    const top = () => {
      window.scrollTo(0, 0)
      document.getElementById('main')?.scrollTo(0, 0)
    }
    top()
    const later = setTimeout(top, 400)
    return () => clearTimeout(later)
  }, [location.pathname])
  return (
    <div className="admin-viewport">
      {header}
      <Button
        className="dw-menu-toggle"
        type="text"
        icon={<MenuOutlined />}
        aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
        aria-expanded={menuOpen}
        aria-controls="dw-sidebar"
        onClick={() => setMenuOpen((v) => !v)}
      />
      <Sidebar groups={groups} demo={demo} open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      {menuOpen && (
        <div className="dw-menu-backdrop" aria-hidden onClick={() => setMenuOpen(false)} />
      )}
      <main className="dw-main" id="main">
        <div className="dw-container">
          {/* 경로가 바뀌면 오류 상태를 초기화 — 다른 메뉴로 이동하면 정상 화면이 다시 보인다 */}
          <ScreenErrorBoundary key={location.pathname}>
            {children ?? <Outlet />}
          </ScreenErrorBoundary>
        </div>
      </main>
    </div>
  )
}
