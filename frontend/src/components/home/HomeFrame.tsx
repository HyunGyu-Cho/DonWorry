import { Alert, Button, Spin } from 'antd'
import type { ReactNode } from 'react'
import { PageHeader } from '../common/PageHeader'

// 홈 공통 틀 — 제목 · 불러오는 중 · 실패 안내
export function HomeFrame(props: {
  title: string
  description: string
  state: 'loading' | 'error' | 'ready'
  onRetry: () => void
  children?: ReactNode
}) {
  const { title, description, state, onRetry, children } = props
  return (
    <>
      <PageHeader title={title} description={description} />
      {state === 'loading' && (
        <div className="dw-error-view" role="status">
          <Spin size="large" />
        </div>
      )}
      {state === 'error' && (
        <Alert
          type="warning"
          showIcon
          message="홈 정보를 불러오지 못했습니다."
          action={<Button onClick={onRetry}>다시 시도</Button>}
        />
      )}
      {state === 'ready' && children}
    </>
  )
}
