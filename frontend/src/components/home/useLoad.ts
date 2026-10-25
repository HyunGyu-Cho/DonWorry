import { useEffect, useState } from 'react'

// 홈 화면 공통 불러오기 — 실패하면 'error', retry를 부르면 다시 불러온다
export function useLoad<T>(fetcher: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ key: string; value: T | 'error' } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    fetcher().then(
      (value) => alive && setState({ key: `${key}:${attempt}`, value }),
      () => alive && setState({ key: `${key}:${attempt}`, value: 'error' }),
    )
    return () => {
      alive = false
    }
    // fetcher는 매 렌더 새로 만들어지므로 key로만 다시 부른다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])
  const fresh = state?.key === `${key}:${attempt}` ? state.value : null
  return { value: fresh, retry: () => setAttempt((n) => n + 1) }
}
