import { Alert, Button, Card, Spin, Table, Tabs, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { getNotifications } from '../../api/payment'
import { PageHeader } from '../../components/common/PageHeader'
import { RawDetails } from '../../components/explain/RawDetails'
import { MAILPIT_URL } from '../../config/demoLinks'
import type { Notification, RecipientType } from '../../types/payment'
import { MAIL_KIND, MAIL_STATUS } from '../../utils/buyerOwner'
import { relativeTime } from '../../utils/humanize'
import { maskEmail } from '../../utils/paymentAlert'

type TabKey = 'ALL' | RecipientType

async function fetchMails(): Promise<Notification[] | null> {
  try {
    return await getNotifications()
  } catch {
    return null
  }
}

// 메일 발송 기록 — 메일 본문은 저장하지 않고 기록만. 받는 사람 이메일은 가려서 보여 준다
export function NotificationsPage() {
  const [rows, setRows] = useState<Notification[] | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<TabKey>('ALL')
  const [now, setNow] = useState(() => new Date())

  const apply = useCallback((result: Notification[] | null) => {
    if (!result) {
      setError(true)
      return
    }
    setNow(new Date())
    setRows([...result].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    setError(false)
  }, [])
  const load = useCallback(() => fetchMails().then(apply), [apply])

  useEffect(() => {
    let alive = true
    void fetchMails().then((result) => {
      if (alive) apply(result)
    })
    return () => {
      alive = false
    }
  }, [apply])

  const header = (
    <PageHeader
      title="메일 발송 기록"
      description="돈워리가 보낸 메일이에요. 구매자에게는 결제 상태와 본인 확인만, 사장님에게는 운영 안내를 보내요. 보안 확인 사유와 점수는 어떤 메일에도 쓰지 않아요."
      actions={
        MAILPIT_URL && (
          <a href={MAILPIT_URL} target="_blank" rel="noreferrer">
            <Button>Mailpit에서 메일 보기 ↗</Button>
          </a>
        )
      }
    />
  )
  if (error) {
    return (
      <>
        {header}
        <Alert
          type="warning"
          showIcon
          message="메일 기록을 불러오지 못했습니다."
          action={<Button onClick={() => void load()}>다시 시도</Button>}
        />
      </>
    )
  }
  if (!rows) {
    return (
      <>
        {header}
        <div className="dw-error-view" role="status">
          <Spin size="large" />
        </div>
      </>
    )
  }

  const count = (t: TabKey) =>
    t === 'ALL' ? rows.length : rows.filter((r) => r.recipientType === t).length
  const shown = tab === 'ALL' ? rows : rows.filter((r) => r.recipientType === tab)
  const columns: ColumnsType<Notification> = [
    {
      title: '발송 시각',
      dataIndex: 'createdAt',
      width: 110,
      render: (v: string) => relativeTime(v, now),
    },
    {
      title: '받는 사람',
      key: 'to',
      width: 230,
      render: (_, n) => (
        <div>
          <Tag color={n.recipientType === 'BUYER' ? 'blue' : 'default'}>
            {n.recipientType === 'BUYER' ? '구매자' : '사장님'}
          </Tag>
          <span className="dw-small">{maskEmail(n.recipientEmail)}</span>
        </div>
      ),
    },
    {
      title: '메일 유형 · 제목',
      key: 'subject',
      render: (_, n) => (
        <div>
          <Tag color={MAIL_KIND[n.kind].color}>{MAIL_KIND[n.kind].label}</Tag>
          {n.subject}
          {n.failureReason && <div className="dw-pa-fail">보내지 못한 이유: {n.failureReason}</div>}
        </div>
      ),
    },
    {
      title: '상태',
      key: 'status',
      width: 150,
      render: (_, n) => (
        <div>
          <Tag color={MAIL_STATUS[n.status].color}>{MAIL_STATUS[n.status].label}</Tag>
          <RawDetails
            title="원본 값"
            rows={[
              ['받는 이메일', n.recipientEmail],
              ['메일 번호', n.notificationId],
              ['결제 번호', n.paymentId ?? '—'],
            ]}
          />
        </div>
      ),
    },
  ]

  return (
    <>
      {header}
      <div className="dw-defense" style={{ marginBottom: 16 }}>
        <div>
          <b>구매자 메일</b>
          <span>결제 완료 · 취소 · 진행 불가. 검토 여부 · 사유 · 점수는 쓰지 않아요</span>
        </div>
        <div>
          <b>본인 확인 요청</b>
          <span>
            "본인이 결제하셨나요?" 답은 AI 조사 근거로 쓰되, 계정이 털리면 공격자도 받을 수 있어
            약한 근거로 봐요
          </span>
        </div>
        <div>
          <b>사장님 메일</b>
          <span>검토 중(주문은 진행) · 결과 · 자동 차단 · 자금 부족 예상</span>
        </div>
      </div>
      <Card>
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as TabKey)}
          items={[
            { key: 'ALL', label: `전체 ${count('ALL')}` },
            { key: 'BUYER', label: `구매자 ${count('BUYER')}` },
            { key: 'OWNER', label: `사장님 ${count('OWNER')}` },
          ]}
        />
        <Table
          rowKey="notificationId"
          columns={columns}
          dataSource={shown}
          pagination={false}
          locale={{ emptyText: '보낸 메일이 없어요.' }}
          rowClassName={(n) => (n.status === 'FAILED' ? 'dw-pa-risk' : '')}
        />
      </Card>
    </>
  )
}
