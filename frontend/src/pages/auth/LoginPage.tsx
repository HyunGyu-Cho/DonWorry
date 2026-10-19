import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'

/**
 * AUTH-01 · 로그인
 * 연동 API: POST /api/auth/login (05-1)
 * 검증 기준: 잠금/비활성화 계정 거부, 역할별 진입. 실제 판정은 서버가 한다.
 */
export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate('/', { replace: true })
    } catch (caught) {
      // 계정 존재 여부가 드러나지 않도록 서버 메시지를 그대로 쓰지 않는다.
      setError(
        caught instanceof ApiError && caught.status === 401
          ? '아이디 또는 비밀번호를 확인하세요.'
          : '로그인에 실패했습니다. 잠시 후 다시 시도하세요.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section>
      <h1>AUTH-01 · 로그인</h1>
      <form onSubmit={handleSubmit}>
        <label>
          이메일
          <input
            type="email"
            value={email}
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? '로그인 중…' : '로그인'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
