import { createBrowserRouter } from 'react-router-dom'
import { HomePage } from './HomePage'

// URL ↔ 화면 연결 — 화면이 생기면 여기에 추가
export const router = createBrowserRouter([{ path: '/', element: <HomePage /> }])
