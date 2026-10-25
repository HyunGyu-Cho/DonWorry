import { Alert, Button, Card, Input, Modal, Spin, Table, Tabs, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { getStaffAlerts } from '../../api/fdsRules'
import { decideApproval, getApprovals } from '../../api/investigation'
import {
  ApprovalClosedError,
  RejectReasonRequiredError,
  SelfApprovalError,
} from '../../api/investigationErrors'
import { useAuth } from '../../auth/useAuth'
import { useFeedback } from '../../components/common/Feedback'
import { PageHeader } from '../../components/common/PageHeader'
import { RawDetails } from '../../components/explain/RawDetails'
import { TermTip } from '../../components/explain/TermTip'
import type { StaffAlert } from '../../types/fds'
import type { ApprovalDecision, ApprovalRequest, ApprovalStatus } from '../../types/investigation'
import { APPROVAL_TYPE, expiresText } from '../../utils/approvals'
import { relativeTime } from '../../utils/humanize'

type Data = { approvals: ApprovalRequest[]; alerts: StaffAlert[] }
type TabKey = 'PENDING' | 'ALL'

const STATUS: Record<ApprovalStatus, [string, string]> = {
  PENDING: ['승인 대기', 'gold'],
  APPROVED: ['승인됨', 'green'],
  REJECTED: ['거절됨', 'red'],
  EXPIRED: ['만료', 'default'],
}

async function fetchApprovals(): Promise<Data | null> {
  try {
    const [approvals, alerts] = await Promise.all([getApprovals(), getStaffAlerts()])
    return { approvals, alerts }
  } catch {
    return null
  }
}

// 승인 후 무엇이 바로 바뀌는지 (토스트 문장)
const DONE_TEXT: Record<string, string> = {
  RULE_DISABLE: 'Rule이 꺼졌습니다. 다음 결제부터 이 Rule은 점수를 더하지 않아요.',
  BLOCKLIST_RELEASE: '차단을 풀었습니다. 이 값의 결제는 이제 점수로만 판단해요.',
}

export function ApprovalsPage() {
  const { user } = useAuth()
  const { toast } = useFeedback()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<TabKey>('PENDING')
  const [now, setNow] = useState(() => new Date())
  const [target, setTarget] = useState<{ row: ApprovalRequest; decision: ApprovalDecision } | null>(
    null,
  )
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  const apply = useCallback((result: Data | null) => {
    if (!result) {
      setError(true)
      return
    }
    setNow(new Date())
    setData(result)
    setError(false)
  }, [])
  const load = useCallback(() => fetchApprovals().then(apply), [apply])

  useEffect(() => {
    let alive = true
    void fetchApprovals().then((result) => {
      if (alive) apply(result)
    })
    return () => {
      alive = false
    }
  }, [apply])

  const close = () => {
    setTarget(null)
    setComment('')
  }
  const submit = async () => {
    if (!target) return
    setSaving(true)
    try {
      await decideApproval(target.row.approvalId, target.decision, comment.trim())
      void toast.success(
        target.decision === 'APPROVE'
          ? (DONE_TEXT[target.row.requestType] ?? '승인했습니다.')
          : '거절했습니다. 요청한 사람에게 이유가 함께 남아요.',
      )
      close()
      await load()
    } catch (e) {
      void toast.error(
        e instanceof SelfApprovalError ||
          e instanceof ApprovalClosedError ||
          e instanceof RejectReasonRequiredError
          ? e.message
          : '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setSaving(false)
    }
  }

  const header = (
    <PageHeader
      title="2인 승인함"
      description="한 사람이 혼자 위험한 변경을 반영하지 못하게, 요청한 사람과 다른 관리자가 승인합니다."
    />
  )
  if (error) {
    return (
      <>
        {header}
        <Alert
          type="warning"
          showIcon
          message="승인 요청을 불러오지 못했습니다."
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

  const pending = data.approvals.filter((a) => a.status === 'PENDING')
  const shown = tab === 'PENDING' ? pending : data.approvals
  const alertOf = (id: number) => data.alerts.find((a) => a.staffHitId === id)

  const columns: ColumnsType<ApprovalRequest> = [
    {
      title: '무엇을',
      key: 'what',
      render: (_, a) => (
        <div>
          <b>{a.targetLabel}</b>
          <div className="dw-pa-chips" style={{ display: 'flex', marginTop: 4 }}>
            <Tooltip title={APPROVAL_TYPE[a.requestType].note}>
              <Tag color={APPROVAL_TYPE[a.requestType].color}>
                {APPROVAL_TYPE[a.requestType].label}
              </Tag>
            </Tooltip>
            {a.riskStaffHitIds.length > 0 && (
              <Tooltip
                title={a.riskStaffHitIds
                  .map((id) => alertOf(id)?.summary)
                  .filter(Boolean)
                  .join(' / ')}
              >
                <Tag color="red">⚠ 탈취 의심 세션에서 요청</Tag>
              </Tooltip>
            )}
          </div>
        </div>
      ),
    },
    {
      title: '누가 · 왜',
      key: 'who',
      render: (_, a) => (
        <div>
          <b>{a.requestedByName}</b>
          <span className="dw-muted dw-small"> · {relativeTime(a.requestedAt, now)}</span>
          <div className="dw-small">{a.reason}</div>
        </div>
      ),
    },
    {
      title: '상태',
      key: 'status',
      width: 170,
      render: (_, a) => (
        <div>
          <Tag color={STATUS[a.status][1]}>{STATUS[a.status][0]}</Tag>
          <div className="dw-muted dw-small">
            {a.status === 'PENDING'
              ? expiresText(a.expiresAt, now)
              : a.decisionComment
                ? `메모: ${a.decisionComment}`
                : ''}
          </div>
        </div>
      ),
    },
    {
      title: '',
      key: 'act',
      width: 150,
      align: 'right',
      render: (_, a) =>
        a.status !== 'PENDING' ? null : a.requestedBy === user?.userId ? (
          <span className="dw-muted dw-small">내 요청 · 다른 관리자가 승인</span>
        ) : (
          <span className="dw-pa-chips">
            <Button size="small" onClick={() => setTarget({ row: a, decision: 'REJECT' })}>
              거절
            </Button>
            <Button
              size="small"
              type="primary"
              onClick={() => setTarget({ row: a, decision: 'APPROVE' })}
            >
              승인
            </Button>
          </span>
        ),
    },
  ]

  return (
    <>
      {header}
      <div className="dw-defense" style={{ marginBottom: 16 }}>
        <div>
          <b>권고 반대 판정</b>
          <span>AI가 승인 취소를 권고한 결제를 매입 허용하려면 재인증 후 여기서 승인</span>
        </div>
        <div>
          <b>Rule 완화 · 차단 해제</b>
          <span>끄기 · 풀기는 승인 후 반영. 다시 켜기 · 등록(강화)은 바로 반영</span>
        </div>
        <div>
          <b>자기 요청 승인 금지</b>
          <span>요청한 사람은 승인할 수 없고, 모든 승인 · 거절은 감사 로그에 남아요</span>
        </div>
      </div>
      <Card>
        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as TabKey)}
          items={[
            { key: 'PENDING', label: `승인 대기 ${pending.length}` },
            { key: 'ALL', label: `전체 ${data.approvals.length}` },
          ]}
        />
        <Table
          rowKey="approvalId"
          columns={columns}
          dataSource={shown}
          pagination={false}
          locale={{ emptyText: '승인할 요청이 없습니다.' }}
          rowClassName={(a) =>
            a.riskStaffHitIds.length > 0 && a.status === 'PENDING' ? 'dw-pa-risk' : ''
          }
        />
      </Card>
      <p className="dw-muted dw-small dw-rule-note">
        <TermTip term="TWO_PERSON" />은 직원 계정이 해킹당해도 혼자서는 검사를 풀 수 없게 하는
        통제입니다.
      </p>
      <Modal
        open={target !== null}
        title={target?.decision === 'APPROVE' ? '이 요청을 승인할까요?' : '이 요청을 거절할까요?'}
        okText={target?.decision === 'APPROVE' ? '승인' : '거절'}
        okButtonProps={{
          danger: target?.decision === 'REJECT',
          disabled: target?.decision === 'REJECT' && !comment.trim(),
        }}
        confirmLoading={saving}
        cancelText="취소"
        onOk={() => void submit()}
        onCancel={close}
      >
        {target && (
          <>
            <p>
              <b>{target.row.targetLabel}</b>
              <br />
              <span className="dw-muted">
                {target.row.requestedByName} · {target.row.reason}
              </span>
            </p>
            {target.row.riskStaffHitIds.length > 0 && target.decision === 'APPROVE' && (
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: 12 }}
                message="탈취가 의심되는 세션에서 온 요청이에요"
                description="본인이 직접 요청했는지 전화 등으로 확인한 뒤 승인해 주세요."
              />
            )}
            <Input.TextArea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                target.decision === 'REJECT'
                  ? '거절 이유 (필수) 예: 탈취 의심 세션에서 온 요청이라 거절'
                  : '메모 (선택) 예: 박지원과 통화로 확인'
              }
              maxLength={300}
              showCount
            />
            <RawDetails
              title="원본 값"
              rows={[
                ['요청 번호', target.row.approvalId],
                ['대상', `${target.row.targetType} ${target.row.targetId}`],
              ]}
            />
          </>
        )}
      </Modal>
    </>
  )
}
