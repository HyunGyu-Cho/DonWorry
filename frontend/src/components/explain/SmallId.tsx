import { Typography } from 'antd'

// 작은 회색 ID + 복사 — 제목 · 문장 안에 섞지 않고 옆이나 아래에만 둔다
export function SmallId({ label = '번호', value }: { label?: string; value: string }) {
  return (
    <Typography.Text
      className="dw-small-id"
      copyable={{ text: value, tooltips: ['복사', '복사됨'] }}
    >
      {label} {value}
    </Typography.Text>
  )
}
