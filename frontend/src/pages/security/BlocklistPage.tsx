import { Alert, Button, Card, Input, Modal, Spin, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBlocklist } from '../../api/fdsRules'
import { createApproval, getApprovals } from '../../api/investigation'
import { ApprovalDuplicateError } from '../../api/investigationErrors'
import { useAuth } from '../../auth/useAuth'
import { useFeedback } from '../../components/common/Feedback'
import { PageHeader } from '../../components/common/PageHeader'
import { RawDetails } from '../../components/explain/RawDetails'
import { TermTip } from '../../components/explain/TermTip'
import type { BlocklistEntry, BlocklistType } from '../../types/fds'
import type { ApprovalRequest } from '../../types/investigation'
import { relativeTime } from '../../utils/humanize'
import { blocklistValueLabel, pendingReleases } from '../../utils/paymentAlert'

type Data = { entries: BlocklistEntry[]; approvals: ApprovalRequest[] }

const TYPES: { type: BlocklistType; label: string; note: string }[] = [
  { type: 'CARD', label: '카드', note: '카드 번호 (가린 값만 저장)' },
  { type: 'DEVICE', label: '기기', note: 'CakeShop이 보낸 기기 ID' },
  { type: 'IP', label: '접속 IP', note: '결제할 때 접속한 IP' },
  { type: 'EMAIL', label: '이메일', note: '구매자 이메일' },
]
const typeLabel = (t: BlocklistType) => TYPES.find((x) => x.type === t)?.label ?? t
// 방금 등록한 값은 강조
const FRESH_MINUTES = 10

async function fetchBlocklist(): Promise<Data | null> {
  try {
    const [entries, approvals] = await Promise.all([getBlocklist(true), getApprovals('PENDING')])
    return { entries, approvals }
  } catch {
    return null
  }
}

export function BlocklistPage() {
  const { user } = useAuth()
  const { toast } = useFeedback()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [releasing, setReleasing] = useState<BlocklistEntry | null>(null)
  const [reason, setReason] = useState('')

  // 해제 요청은 보안 직원만. 보안 관리자가 승인해야 풀린다
  const canAct = user?.role === 'SECURITY_STAFF'

  const apply = useCallback((result: Data | null) => {
    if (!result) {
      setError(true)
      return
    }
    setNow(new Date())
    setData(result)
    setError(false)
  }, [])
  const load = useCallback(() => fetchBlocklist().then(apply), [apply])

  useEffect(() => {
    let alive = true
    void fetchBlocklist().then((result) => {
      if (alive) apply(result)
    })
    return () => {
      alive = false
    }
  }, [apply])

  const pending = useMemo(
    () => (data ? pendingReleases(data.approvals) : new Map<number, ApprovalRequest>()),
    [data],
  )

  const submitRelease = async () => {
    if (!releasing) return
    const entry = releasing
    try {
      await createApproval({
        requestType: 'BLOCKLIST_RELEASE',
        targetType: 'BLOCKLIST_ENTRY',
        targetId: entry.entryId,
        targetLabel: `차단 목록 ${typeLabel(entry.entryType)} · ${entry.reason}`,
        reason: reason.trim(),
      })
      void toast.success('해제 요청을 보냈습니다. 보안 관리자가 승인하면 풀립니다.')
      setReleasing(null)
      setReason('')
      await load()
    } catch (e) {
      void toast.error(
        e instanceof ApprovalDuplicateError
          ? e.message
          : '요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
    }
  }

  const header = (
    <PageHeader
      title="차단 목록"
      description="사기로 확인된 카드 · 기기 · IP · 이메일입니다. 여기 있는 값과 일치하면 점수를 계산하지 않고 바로 막습니다."
    />
  )
  if (error) {
    return (
      <>
        {header}
        <Alert
          type="warning"
          showIcon
          message="차단 목록을 불러오지 못했습니다."
          action={<Button onClick={() => void load()}>다시 시도</Button>}
        />
      </>
    )
  }
  if (!data) {
    return (
      <>
        {header}
        <div className="dw-error-view" role="status">
          <Spin size="large" />
        </div>
      </>
    )
  }

  const columns: ColumnsType<BlocklistEntry> = [
    {
      title: '종류',
      dataIndex: 'entryType',
      width: 90,
      render: (t: BlocklistType) => <Tag>{typeLabel(t)}</Tag>,
    },
    {
      title: '값 · 사유',
      key: 'value',
      render: (_, b) => {
        const label = blocklistValueLabel(b)
        return (
          <div>
            {label && <b>{label} · </b>}
            <span>{b.reason}</span>
            <RawDetails title="원본 값" rows={[['값', <code key="v">{b.entryValue}</code>]]} />
          </div>
        )
      },
    },
    {
      title: '등록',
      key: 'created',
      width: 150,
      render: (_, b) => (
        <div>
          <div>{relativeTime(b.createdAt, now)}</div>
          <div className="dw-muted dw-small">
            {b.source === 'CASE' && b.sourceRef !== null ? (
              <Link to={`/security/cases/${b.sourceRef}`}>사건 판정으로</Link>
            ) : (
              '직원이 직접'
            )}
          </div>
        </div>
      ),
    },
    {
      title: '최근 7일 차단',
      key: 'hits',
      width: 130,
      render: (_, b) =>
        b.hits7d > 0 ? (
          <div>
            <Tag color="red">{b.hits7d}건 막음</Tag>
            {b.lastHitAt && (
              <div className="dw-muted dw-small">마지막 {relativeTime(b.lastHitAt, now)}</div>
            )}
          </div>
        ) : (
          <span className="dw-muted">—</span>
        ),
    },
    {
      title: '',
      key: 'action',
      width: 130,
      align: 'right',
      render: (_, b) => {
        const wait = pending.get(b.entryId)
        if (wait) {
          return (
            <Tag color="gold" title={`${wait.requestedByName} 요청 · ${wait.reason}`}>
              해제 승인 대기
            </Tag>
          )
        }
        return canAct ? (
          <Button size="small" onClick={() => setReleasing(b)}>
            해제 요청
          </Button>
        ) : null
      },
    },
  ]

  return (
    <>
      {header}
      <div className="dw-pa-stats">
        {TYPES.map((t) => (
          <Card key={t.type} className="dw-pa-stat">
            <div className="dw-muted dw-small">{t.label}</div>
            <div className="dw-pa-stat-value">
              {data.entries.filter((b) => b.entryType === t.type).length}
              <small>건</small>
            </div>
            <div className="dw-muted dw-small">{t.note}</div>
          </Card>
        ))}
      </div>
      <Card
        title="등록된 값"
        extra={<span className="dw-muted dw-small">결제 경보 상세에서 등록</span>}
      >
        <Table
          rowKey="entryId"
          columns={columns}
          dataSource={[...data.entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
          pagination={false}
          locale={{ emptyText: '등록된 값이 없습니다.' }}
          rowClassName={(b) =>
            now.getTime() - Date.parse(b.createdAt) < FRESH_MINUTES * 60_000 ? 'dw-pa-fresh' : ''
          }
        />
      </Card>
      <p className="dw-muted dw-small dw-rule-note">
        차단 해제는 잘못 풀면 사기 결제가 다시 들어올 수 있어 <TermTip term="TWO_PERSON" />을
        거칩니다. 등록은 바로 반영됩니다.
      </p>
      <Modal
        open={releasing !== null}
        title="차단 해제 요청"
        okText="승인 요청 보내기"
        cancelText="취소"
        okButtonProps={{ disabled: reason.trim().length < 5 }}
        onOk={() => void submitRelease()}
        onCancel={() => {
          setReleasing(null)
          setReason('')
        }}
      >
        {releasing && (
          <p>
            <b>
              {typeLabel(releasing.entryType)} · {releasing.reason}
            </b>
            <br />
            풀면 이 값으로 들어오는 결제를 다시 점수로만 판단해요. 다른 보안 관리자가 승인해야
            풀립니다.
          </p>
        )}
        <Input.TextArea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="해제 이유 (5자 이상) 예: 가맹점 사무실 IP로 확인됨"
          maxLength={200}
          showCount
        />
      </Modal>
    </>
  )
}
