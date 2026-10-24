import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canOpenPath, sessionNavigation } from '../src/config/navigation.ts'
import type { AuthUser } from '../src/types/auth.ts'

const base: AuthUser = {
  userId: 1,
  loginId: 'user',
  displayName: '테스트',
  role: 'ADMIN',
  merchantId: null,
  tenantScope: null,
  permissions: [],
}
const admin: AuthUser = { ...base, role: 'ADMIN', tenantScope: 'ALL' }
const staff: AuthUser = { ...base, role: 'SECURITY_STAFF' }
const manager: AuthUser = { ...base, role: 'SECURITY_MANAGER' }
const owner = (permissions: string[]): AuthUser => ({
  ...base,
  role: 'OPERATOR',
  merchantId: 10,
  permissions,
})

const paths = (user: AuthUser) =>
  sessionNavigation(user).groups.flatMap((group) => group.items.map((item) => item.path))

test('역할별 첫 화면으로 보낸다', () => {
  assert.equal(sessionNavigation(admin).landing, '/admin/fds')
  assert.equal(sessionNavigation(staff).landing, '/security/home')
  assert.equal(sessionNavigation(manager).landing, '/manager/home')
  assert.equal(sessionNavigation(owner(['FDS_VIEW', 'FINANCE_VIEW'])).landing, '/owner/home')
})

test('사장님 메뉴는 권한이 있는 것만 보인다', () => {
  assert.deepEqual(paths(owner(['FINANCE_VIEW'])), [
    '/owner/home',
    '/owner/settlements',
    '/owner/funds',
    '/owner/loans',
  ])
  assert.deepEqual(paths(owner(['FDS_VIEW'])), ['/owner/home', '/owner/results'])
  // 권한이 없어도 홈은 보인다 (홈 카드는 1-11에서 권한별로 거른다)
  assert.deepEqual(paths(owner([])), ['/owner/home'])
})

test('다른 역할 화면과 권한 없는 메뉴는 열 수 없다', () => {
  assert.equal(canOpenPath(staff, '/security/cases/3'), true)
  assert.equal(canOpenPath(staff, '/admin/fds'), false)
  assert.equal(canOpenPath(staff, '/owner/home'), false)
  assert.equal(canOpenPath(admin, '/security/cases'), false)
  assert.equal(canOpenPath(owner(['FINANCE_VIEW']), '/owner/funds'), true)
  assert.equal(canOpenPath(owner(['FINANCE_VIEW']), '/owner/results'), false)
  // 없는 화면은 404가 처리하도록 막지 않는다.
  assert.equal(canOpenPath(owner(['FINANCE_VIEW']), '/owner/unknown'), true)
})

// 보안 직원이 관리자 화면(2인 승인 · 직원 감시 · 감사 로그)을 열면 안 된다
test('managerMenus_areOnlyForSecurityManager', () => {
  const nav = sessionNavigation(manager)
  assert.equal(nav.label, '보안 관리자')
  assert.deepEqual(paths(manager), [
    '/manager/home',
    '/manager/approvals',
    '/manager/rules',
    '/manager/access',
    '/manager/cases',
    '/manager/audit',
  ])
  assert.equal(canOpenPath(manager, '/manager/approvals'), true)
  assert.equal(canOpenPath(staff, '/manager/approvals'), false)
  assert.equal(canOpenPath(staff, '/manager/audit'), false)
  assert.equal(canOpenPath(manager, '/security/cases'), false)
  assert.equal(canOpenPath(manager, '/owner/home'), false)
})

// 보안 직원 메뉴는 프로토타입 v4.2와 같은 순서
test('securityMenus_followPrototype', () => {
  assert.deepEqual(
    sessionNavigation(staff).groups.map((g) => g.title),
    ['홈', '탐지', '조사', '조치 · 알림'],
  )
  assert.ok(!paths(staff).includes('/security/transactions'))
})
