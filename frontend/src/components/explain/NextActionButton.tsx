import { ArrowRightOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { Link } from 'react-router-dom'

interface NextActionButtonProps {
  to: string
  label: string
  // 왜 이걸 하면 되는지 한 줄
  hint?: string
}

// 화면 끝 "다음 할 일" — 화면마다 하나만
export function NextActionButton({ to, label, hint }: NextActionButtonProps) {
  return (
    <div className="dw-next">
      {hint && <span className="dw-next-hint">{hint}</span>}
      <Link to={to}>
        <Button type="primary" size="large">
          {label} <ArrowRightOutlined />
        </Button>
      </Link>
    </div>
  )
}
