import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // /api 요청을 백엔드(8081)로 넘김 — CORS 설정 없이 개발 가능
  server: { proxy: { '/api': 'http://localhost:8081' } },
})
