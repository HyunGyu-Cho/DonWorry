import type { AuthUser } from '../types/auth.ts'

export type Role = 'security' | 'owner'
export type Permission = 'FDS_VIEW' | 'FINANCE_VIEW'
export type NavItem = { label: string; path: string; permission?: Permission }
export type NavGroup = { title: string; items: NavItem[] }

export const roles: Record<Role, { label: string; userName: string; landing: string }> = {
  security: { label: '보안 직원', userName: '박지원', landing: '/security/home' },
  owner: { label: '사장님', userName: '김사장', landing: '/owner/home' },
}

// 메뉴 구성은 시연용 프로토타입 v4.2와 같다. 아직 없는 화면은 빈 화면으로 연결한다 (app/router.tsx)
export const navByRole: Record<Role, NavGroup[]> = {
  security: [
    { title: '홈', items: [{ label: '홈', path: '/security/home' }] },
    {
      title: '탐지',
      items: [
        { label: 'Rule 카탈로그', path: '/security/rules' },
        { label: '결제 경보', path: '/security/alerts' },
        { label: '차단 목록', path: '/security/blocklist' },
      ],
    },
    { title: '조사', items: [{ label: '사건 목록', path: '/security/cases' }] },
    {
      title: '조치 · 알림',
      items: [
        { label: '조치 센터', path: '/security/actions' },
        { label: '메일 발송 기록', path: '/security/notifications' },
      ],
    },
  ],
  owner: [
    {
      title: '홈',
      items: [
        { label: '홈', path: '/owner/home' },
        { label: '보안 확인 결과', path: '/owner/results', permission: 'FDS_VIEW' },
      ],
    },
    {
      title: '자금',
      items: [
        { label: '정산 캘린더', path: '/owner/settlements', permission: 'FINANCE_VIEW' },
        { label: '자금 현황', path: '/owner/funds', permission: 'FINANCE_VIEW' },
        { label: '연계 대출 상품', path: '/owner/loans', permission: 'FINANCE_VIEW' },
      ],
    },
  ],
}

// 보안 관리자 — 직원 계정 사건 판정 · 2인 승인 · 직원 접속 감시
export const managerNavigation: NavGroup[] = [
  { title: '홈', items: [{ label: '홈', path: '/manager/home' }] },
  {
    title: '통제',
    items: [
      { label: '2인 승인함', path: '/manager/approvals' },
      { label: 'Rule 카탈로그', path: '/manager/rules' },
    ],
  },
  {
    title: '직원 계정 보호',
    items: [
      { label: '직원 접속 감시', path: '/manager/access' },
      { label: '사건 목록', path: '/manager/cases' },
      { label: '감사 로그', path: '/manager/audit' },
    ],
  },
]

export const adminNavigation = {
  label: '관리자',
  landing: '/admin/fds',
  groups: [
    {
      title: '관리',
      items: [
        { label: 'FDS', path: '/admin/fds' },
        { label: '자금관리', path: '/admin/finance' },
      ],
    },
  ] satisfies NavGroup[],
}

type SessionRole = AuthUser['role']

const sessionMenus: Record<SessionRole, { label: string; base: string; groups: NavGroup[] }> = {
  ADMIN: { label: adminNavigation.label, base: '/admin', groups: adminNavigation.groups },
  SECURITY_STAFF: { label: roles.security.label, base: '/security', groups: navByRole.security },
  SECURITY_MANAGER: { label: '보안 관리자', base: '/manager', groups: managerNavigation },
  OPERATOR: { label: roles.owner.label, base: '/owner', groups: navByRole.owner },
}

/** 서버 로그인 사용자의 메뉴 · 첫 화면. 권한이 필요한 메뉴는 permissions에 있을 때만 보인다. */
export function sessionNavigation(user: AuthUser) {
  const menu = sessionMenus[user.role]
  const groups = menu.groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.permission || user.permissions.includes(item.permission),
      ),
    }))
    .filter((group) => group.items.length > 0)
  // 볼 수 있는 메뉴가 하나도 없으면 첫 화면도 없다.
  const landing = groups[0]?.items[0]?.path ?? null
  return { label: menu.label, base: menu.base, groups, landing }
}

/** 메뉴에 걸린 권한이 있으면 그 권한이 있어야 경로에 들어갈 수 있다. */
export function canOpenPath(user: AuthUser, pathname: string) {
  const { base, groups } = sessionNavigation(user)
  if (pathname !== base && !pathname.startsWith(base + '/')) return false
  const guarded = sessionMenus[user.role].groups
    .flatMap((group) => group.items)
    .find((item) => pathname === item.path || pathname.startsWith(item.path + '/'))
  if (!guarded?.permission) return true
  return groups.some((group) => group.items.some((item) => item.path === guarded.path))
}
