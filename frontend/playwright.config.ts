import { defineConfig, devices } from '@playwright/test'

// 시연 시나리오 5개를 Mock 모드에서 처음부터 끝까지 눌러 본다 (docs/frontend/e2e-scenarios.md)
const PORT = 5174

export default defineConfig({
  testDir: './e2e',
  // AI 실시간 조사(약 20초) · 조치 반영(약 5초)을 기다리는 단계가 있어 넉넉하게
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
  },
  // 넓은 화면 · 노트북 · 반 화면(1-14). 1024px 미만은 메뉴가 ☰ 속으로 들어간다
  projects: [
    { name: 'wide-1440', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'laptop-1024', use: { viewport: { width: 1024, height: 768 } } },
    { name: 'narrow-800', use: { viewport: { width: 800, height: 800 } } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    env: { VITE_USE_MOCK: 'true' },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
