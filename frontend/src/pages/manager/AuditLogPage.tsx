import { Alert, Button, Card, Spin, Table, Tabs, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { getAuditLogs } from '../../api/investigation'
import { PageHeader } from '../../components/common/PageHeader'
import { RawDetails } from '../../components/explain/RawDetails'
import type { AuditLog } from '../../types/investigation'
import { auditActionText, auditDetailText, auditTargetText } from '../../utils/approvals'
import { placeName, relativeTime } from '../../utils/humanize'

async function fetchLogs(): Promise<AuditLog[] | null> {
  try {
    return await getAuditLogs()
  } catch {
    return null
  }
}

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[] | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState('ALL')
  const [now, setNow] = useState(() => new Date())

  const apply = useCallback((result: AuditLog[] | null) => {
    if (!result) {
      setError(true)
      return
    }
    setNow(new Date())
    setLogs(result)
    setError(false)
  }, [])
  const load = useCallback(() => fetchLogs().then(apply), [apply])

  useEffect(() => {
    let alive = true
    void fetchLogs().then((result) => {
      if (alive) apply(result)
    })
    return () => {
      alive = false
    }
  }, [apply])

  const header = (
    <PageHeader
      title="감사 로그"
      description="직원이 한 중요한 행동(로그인 · 판정 · 승인 · 설정 변경 · 차단 목록)을 지울 수 없게 남깁니다. 사고가 나면 누가 · 언제 · 어디서 · 무엇을 했는지 따라갑니다."
    />
  )
  if (error) {
    return (
      <>
        {header}
        <Alert
          type="warning"
          showIcon
          message="감사 로그를 불러오지 못했습니다."
          action={<Button onClick={() => void load()}>다시 시도</Button>}
        />
      </>
    )
  }
  if (!logs) {
    return (
      <>
        {header}
        <div className="dw-error-view" role="status">
          <Spin size="large" />
        </div>
      </>
    )
  }

  const people = [...new Set(logs.filter((l) => l.actorType === 'STAFF').map((l) => l.actorName))]
  const shown = logs.filter((l) =>
    tab === 'ALL' ? true : tab === 'SUSPICIOUS' ? l.suspiciousSession : l.actorName === tab,
  )

  const columns: ColumnsType<AuditLog> = [
    {
      title: '발생 시각',
      dataIndex: 'occurredAt',
      width: 110,
      render: (v: string) => relativeTime(v, now),
    },
    {
      title: '직원',
      key: 'who',
      width: 100,
      render: (_, l) =>
        l.actorType === 'STAFF' ? (
          <b>{l.actorName}</b>
        ) : (
          <span className="dw-muted">{l.actorName}</span>
        ),
    },
    {
      title: '접속 위치',
      key: 'where',
      render: (_, l) =>
        l.client ? (
          <span>
            {placeName(l.client.label)}
            {l.suspiciousSession && (
              <Tag color="red" style={{ marginLeft: 6 }}>
                의심 세션
              </Tag>
            )}
          </span>
        ) : (
          <span className="dw-muted">
            {l.actorType === 'STAFF' ? '확인되지 않은 접속 위치' : '서버 자동'}
          </span>
        ),
    },
    {
      title: '작업',
      key: 'what',
      render: (_, l) => (
        <div>
          <b>{auditActionText(l.action)}</b>
          {auditTargetText(l) && <span className="dw-muted"> · {auditTargetText(l)}</span>}
          {auditDetailText(l.detail) && (
            <div className="dw-muted dw-small">{auditDetailText(l.detail)}</div>
          )}
        </div>
      ),
    },
    {
      title: '',
      key: 'raw',
      width: 140,
      render: (_, l) => (
        <RawDetails
          title="원본 값"
          rows={[
            ['동작 코드', l.action],
            ['대상', l.targetType ? `${l.targetType} ${l.targetId ?? ''}` : '—'],
            ['IP', l.clientIp ?? '—'],
            ['상세', l.detail ? JSON.stringify(l.detail) : '—'],
          ]}
        />
      ),
    },
  ]

  return (
    <>
      {header}
      <Card>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: 'ALL', label: `전체 ${logs.length}` },
            {
              key: 'SUSPICIOUS',
              label: `의심 세션 ${logs.filter((l) => l.suspiciousSession).length}`,
            },
            ...people.map((name) => ({
              key: name,
              label: `${name} ${logs.filter((l) => l.actorName === name).length}`,
            })),
          ]}
        />
        <Table
          rowKey="auditId"
          columns={columns}
          dataSource={shown}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: '기록이 없습니다.' }}
          rowClassName={(l) => (l.suspiciousSession ? 'dw-pa-risk' : '')}
        />
      </Card>
      <p className="dw-muted dw-small dw-rule-note">
        감사 로그는 고치거나 지울 수 없습니다. 빨간 줄은 탈취가 의심되는 세션에서 한 행동이에요.
      </p>
    </>
  )
}
