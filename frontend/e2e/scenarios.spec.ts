import { expect, test, type Page } from '@playwright/test'

// docs/frontend/e2e-scenarios.md의 시나리오 5개를 처음 쓰는 사람처럼 튜토리얼을 따라 누른다
// 버튼은 튜토리얼 노란 테두리 이름표(data-tour)로 찾는다. Mock 상태는 새로 고침하면 처음으로 돌아가 page.goto는 로그인 때만 쓴다

const tour = (page: Page, name: string) => page.locator(`[data-tour~="${name}"]`).first()
const card = (page: Page) => page.locator('.dw-tut')

// 카드가 대상을 가려 작은 버튼으로 접혀 있으면 펼친다. 접힘 · 펼침이 수시로 바뀌어 될 때까지 다시 해 본다
// 확인 창이 닫히는 중이면 덮여 있어 클릭 대신 이벤트를 보낸다
async function openCard(page: Page, check: () => Promise<void>) {
  await expect(async () => {
    const fab = page.locator('.dw-tut-fab')
    if (await fab.isVisible()) await fab.dispatchEvent('click', undefined, { timeout: 1_000 })
    await check()
  }).toPass({ timeout: 20_000 })
}

// 튜토리얼 카드의 "n / total단계"
async function expectStep(page: Page, n: number, total: number) {
  await openCard(page, () =>
    expect(card(page)).toContainText(`${n} / ${total}단계`, { timeout: 1_000 }),
  )
}

async function nextStep(page: Page) {
  await openCard(page, () =>
    card(page).getByRole('button', { name: '다음', exact: true }).click({ timeout: 1_000 }),
  )
}

// 랜딩에서 시나리오를 고른 것과 같은 주소로 로그인 화면을 연다
async function login(page: Page, scenario: number, password = '1234') {
  await page.goto(`/login?scenario=${scenario}`)
  await expect(page.getByLabel('아이디')).not.toHaveValue('')
  await page.getByLabel('비밀번호').fill(password)
  await page.getByRole('button', { name: '로그인', exact: true }).click()
}

async function typeCode(page: Page, label: string, code: string) {
  await page.getByLabel(label).locator('input').first().click()
  await page.keyboard.type(code)
}

test('① 결제 사기 의심 — 경보 → 사건 → AI 재조사 → 판정 → 조치', async ({ page }) => {
  await login(page, 1)
  await typeCode(page, '인증 코드 6자리', '246810')
  await expect(page).toHaveURL(/\/security\/home$/)
  await expectStep(page, 1, 9)

  await tour(page, 'home-alerts').click()
  await expectStep(page, 2, 9)
  await tour(page, 'alert-103').click()
  await expect(page).toHaveURL(/\/security\/alerts\/103$/)
  await expectStep(page, 3, 9)
  await expect(page.getByRole('cell', { name: '평소 평균 4만 원의 16배' })).toBeVisible()

  await tour(page, 'alert-case-link').click()
  await expect(page).toHaveURL(/\/security\/cases\/201$/)
  await expectStep(page, 4, 9)
  await expect(tour(page, 'case-flow')).toBeVisible()
  await nextStep(page)

  // 구매자가 "결제하지 않았다"고 답하면 AI가 v2로 다시 조사한다
  await expectStep(page, 5, 9)
  await card(page)
    .getByRole('button', { name: /구매자 답변 도착시키기/ })
    .click()
  await expect(tour(page, 'case-ai')).toContainText('구매자가 결제하지 않았다고', {
    timeout: 40_000,
  })

  await tour(page, 'report-open').click()
  await expect(page).toHaveURL(/\/security\/cases\/201\/report$/)
  await page.getByRole('tab', { name: 'AI가 조사한 과정' }).click()
  await page.goBack()
  await expect(page).toHaveURL(/\/security\/cases\/201$/)

  // 판정: 결제별로 승인 취소 + 사유 → 확인 창
  const right = tour(page, 'case-right')
  await right.getByText('승인 취소', { exact: true }).first().click()
  await right
    .getByLabel(/판정 사유/)
    .first()
    .fill('구매자가 결제하지 않았다고 답함')
  await right.getByRole('button', { name: /판정 확정/ }).click()
  await page
    .locator('.ant-modal-confirm')
    .getByRole('button', { name: /확정|확인/ })
    .click()
  // 조치가 약 5초 "조치 진행 중"으로 머문 뒤 결제에 반영되고 사건이 끝난다
  await expect(page.getByText('조치 진행 중').first()).toBeVisible()
  await expectStep(page, 9, 9)
  await expect(page.getByText('종료', { exact: true }).first()).toBeVisible({ timeout: 20_000 })

  await tour(page, 'nav-security-actions').click()
  await expect(page).toHaveURL(/\/security\/actions$/)
  await expect(page.getByText('단체 행사용 케이크 세트').first()).toBeVisible()
})

test('② 직원 계정 분산 공격 — 사건 → AI 실패 · 재시도 → 계정별로 묶기', async ({ page }) => {
  await login(page, 2)
  await typeCode(page, '인증 코드 6자리', '246810')
  await expect(page).toHaveURL(/\/manager\/home$/)
  await expectStep(page, 1, 6)

  await tour(page, 'home-staff-cases').click()
  await expect(page).toHaveURL(/\/manager\/cases$/)
  await expectStep(page, 2, 6)
  await tour(page, 'case-102').click()
  await expect(page).toHaveURL(/\/manager\/cases\/102$/)
  await expectStep(page, 3, 6)

  // 실시간 조사: 1차 판단이 실패하고 다시 시도한 뒤 끝난다
  await expect(tour(page, 'case-ai')).toContainText('다시 시도', { timeout: 30_000 })
  await expect(tour(page, 'case-ai')).toContainText('비밀번호를 대입', { timeout: 40_000 })
  await nextStep(page)
  await expectStep(page, 4, 6)
  await expect(tour(page, 'case-flow')).toContainText('패스워드 스프레이')
  await nextStep(page)

  await tour(page, 'report-open').click()
  await expect(page).toHaveURL(/\/manager\/cases\/102\/report$/)
  await page.getByRole('tab', { name: 'AI가 조사한 과정' }).click()
  await expect(page.locator('.dw-trace-meta').getByText('다시 시도').first()).toBeVisible()

  await page.getByRole('link', { name: '로그인 모니터링' }).click()
  await expect(page).toHaveURL(/\/manager\/access$/)
  await expectStep(page, 6, 6)
  await tour(page, 'access-by-account').click()
  await expect(page.getByText('박지원').first()).toBeVisible()
})

test('③ 정산 자금 부족 — 이메일 확인 → 정산 캘린더 → 자금 예측 → 대출', async ({ page }) => {
  await login(page, 3)
  // 새 기기라 가입 이메일로 한 번 더 확인한다
  await expect(page.getByText('이메일로 한 번 더 확인할게요')).toBeVisible()
  await typeCode(page, '이메일 확인 코드 6자리', '135790')
  await expect(page).toHaveURL(/\/owner\/home$/)
  await expectStep(page, 1, 5)

  await tour(page, 'home-checking').click()
  await expect(page).toHaveURL(/\/owner\/results/)
  await expectStep(page, 2, 5)
  await tour(page, 'nav-owner-settlements').click()
  await expect(page).toHaveURL(/\/owner\/settlements$/)
  await expectStep(page, 3, 5)

  // 주문이 몰린 날: 칸에는 합계만, 누르면 옆 창 목록 → 전체 페이지
  await tour(page, 'stl-busy').click()
  await page.getByRole('button', { name: /건 모두 보기/ }).click()
  const drawer = page.locator('.dw-stl-drawer')
  await expect(drawer.locator('tbody tr').first()).toBeVisible()
  await drawer.getByRole('button', { name: /전체 페이지로 보기/ }).click()
  await expect(page).toHaveURL(/\/owner\/settlements\/\d{4}-\d{2}-\d{2}$/)

  await page.getByRole('link', { name: '자금 현황' }).click()
  await expect(page).toHaveURL(/\/owner\/funds$/)
  await expectStep(page, 4, 5)
  await expect(page.getByText(/모자라요/).first()).toBeVisible()
  await tour(page, 'fund-loans').click()
  await expect(page).toHaveURL(/\/owner\/loans$/)
  await expectStep(page, 5, 5)
  await expect(tour(page, 'loan-list')).toBeVisible()
})

test('④ 직원 계정 탈취 — 위험 요청 거절 → 세션 종료 → 사건 · 감사 로그', async ({ page }) => {
  await login(page, 4)
  await typeCode(page, '인증 코드 6자리', '246810')
  await expect(page).toHaveURL(/\/manager\/home$/)
  await expectStep(page, 1, 5)

  await tour(page, 'home-approvals').click()
  await expect(page).toHaveURL(/\/manager\/approvals$/)
  await expectStep(page, 2, 5)

  // 탈취 의심 세션에서 온 "고액 결제" Rule 끄기 요청을 거절 → 다음 단계로
  const row = tour(page, 'approvals-list').locator('tr', { hasText: '탈취 의심' }).first()
  await row.getByRole('button', { name: '거절' }).click()
  const modal = page.locator('.ant-modal').filter({ hasText: '이 요청을 거절할까요?' })
  await modal.locator('textarea').fill('탈취 의심 세션에서 온 요청이라 거절')
  await modal.getByRole('button', { name: '거절' }).click()
  await expectStep(page, 3, 5)

  await tour(page, 'nav-manager-access').click()
  await expect(page).toHaveURL(/\/manager\/access$/)
  await page.getByRole('tab', { name: /세션/ }).click()
  await page.locator('button[data-tour~="session-kill"]').click()
  await page
    .locator('.ant-modal-confirm')
    .getByRole('button', { name: /종료|끊기|확인/ })
    .click()
  await expect(page.getByText('강제 종료').first()).toBeVisible()
  await expectStep(page, 4, 5)

  await page.getByRole('link', { name: '사건 목록' }).click()
  await page.locator('.ant-table-row', { hasText: '보안 직원 박지원 계정' }).first().click()
  await expect(page).toHaveURL(/\/manager\/cases\/101$/)
  // 다른 화면에서 한 거절 · 세션 종료가 사건 기록에 남는다
  await expect(page.getByText(/세션 강제 종료/).first()).toBeVisible()

  await tour(page, 'nav-manager-audit').click()
  await expect(page).toHaveURL(/\/manager\/audit$/)
  await expectStep(page, 5, 5)
})

test('⑤ 카드 테스팅 → 자동 차단 — 거절된 경보 → 차단 목록 등록', async ({ page }) => {
  await login(page, 5)
  await typeCode(page, '인증 코드 6자리', '246810')
  await expect(page).toHaveURL(/\/security\/home$/)
  await expectStep(page, 1, 4)

  await tour(page, 'nav-security-alerts').click()
  await expectStep(page, 2, 4)
  await tour(page, 'alert-106').click()
  await expect(page).toHaveURL(/\/security\/alerts\/106$/)
  await expectStep(page, 3, 4)
  // 가입 40분 계정이라 평소와 비교할 수 없다고 말한다
  await expect(page.getByText('이전 결제가 없어 비교할 수 없어요').first()).toBeVisible()

  // 추천 값은 미리 골라져 있고 IP는 주의
  await tour(page, 'alert-block').click()
  const modal = page.locator('.ant-modal').filter({ hasText: '차단 목록에 등록' })
  await expect(modal.getByText('주의 · 여러 명이 같이 씀')).toBeVisible()
  await expect(modal.locator('input[type=checkbox]:checked')).toHaveCount(3)
  await modal.locator('textarea').fill('카드 테스팅 시도')
  await modal.getByRole('button', { name: '등록' }).click()
  await expect(page.getByText('차단 3건 등록됨 ✓')).toBeVisible()
  await expectStep(page, 4, 4)

  await tour(page, 'nav-security-blocklist').click()
  await expect(page).toHaveURL(/\/security\/blocklist$/)
  await expect(tour(page, 'blocklist-table').getByText('방금 등록')).toHaveCount(3)
})
