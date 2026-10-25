import { ArrowLeftOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Checkbox, Input, Modal, Spin, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getFdsEvaluation, type FdsEvaluationDetail, type FdsRuleHit } from '../../api/fds'
import { addBlocklistEntry, getBlocklist } from '../../api/fdsRules'
import { getPaymentContext } from '../../api/payment'
import { useFeedback } from '../../components/common/Feedback'
import { PageHeader } from '../../components/common/PageHeader'
import { RawDetails } from '../../components/explain/RawDetails'
import { TermTip } from '../../components/explain/TermTip'
import { RULE_GUIDE, SCORE_BANDS } from '../../config/fdsRules'
import type { BlocklistEntry, RuleCode } from '../../types/fds'
import type { PaymentContext } from '../../types/payment'
import { koreanWon, relativeTime } from '../../utils/humanize'
import {
  blockCandidates,
  isBlocklisted,
  paymentFacts,
  TONE_COLOR,
  verdict,
  type BlockCandidate,
  type Fact,
} from '../../utils/paymentAlert'

type Data = {
  detail: FdsEvaluationDetail
  payment: PaymentContext | null
  blocklist: BlocklistEntry[]
}

// 경보 · 결제 · 차단 목록을 한 번에. 경보가 없으면 'missing', 실패하면 null
async function fetchAlert(id: string): Promise<Data | 'missing' | null> {
  try {
    const detail = await getFdsEvaluation(id)
    if (!detail) return 'missing'
    const [payment, blocklist] = await Promise.all([
      getPaymentContext(String(detail.evaluation.paymentId)),
      getBlocklist(true),
    ])
    return { detail, payment, blocklist }
  } catch {
    return null
  }
}

const FACT_ICON: Record<Fact['tone'], string> = { ok: '✅', warn: '⚠', bad: '🔴' }

function FactRow({ fact }: { fact: Fact }) {
  return (
    <div className={`dw-pa-fact dw-pa-fact--${fact.tone}`}>
      <span className="dw-pa-fact-icon" aria-hidden>
        {FACT_ICON[fact.tone]}
      </span>
      <span className="dw-pa-fact-label">{fact.label}</span>
      <span>{fact.text}</span>
    </div>
  )
}

// 점수 구간 막대 + 이 결제 위치
function ScoreCard({ detail }: { detail: FdsEvaluationDetail }) {
  const e = detail.evaluation
  const v = verdict(e)
  const bands = [...SCORE_BANDS].reverse()
  return (
    <Card title="위험 점수" extra={<Tag color={TONE_COLOR[v.tone]}>{v.label}</Tag>}>
      <div className="dw-pa-score">
        <div className={`dw-pa-score-num dw-pa-score-num--${v.tone}`}>
          {e.riskScore !== null ? (
            <>
              <b>{e.riskScore}</b>
              <span>점</span>
            </>
          ) : (
            <b>{e.result === 'ERROR' ? '?' : '⛔'}</b>
          )}
        </div>
        <div className="dw-pa-score-side">
          <div className="dw-rule-scale">
            {bands.map((b) => (
              <div key={b.result} className={`dw-rule-band-${b.result}`}>
                {b.min}점~
              </div>
            ))}
          </div>
          {e.riskScore !== null && (
            <div className="dw-pa-marker" style={{ left: `${Math.min(e.riskScore, 99)}%` }}>
              ▲ {e.riskScore}
            </div>
          )}
          <p className="dw-pa-meaning">{v.meaning}</p>
        </div>
      </div>
    </Card>
  )
}

function RuleTable({ detail }: { detail: FdsEvaluationDetail }) {
  const e = detail.evaluation
  const blocked = isBlocklisted(e)
  const columns: ColumnsType<FdsRuleHit> = [
    {
      title: 'Rule',
      key: 'rule',
      render: (_, h) => (
        <div>
          <b>{h.ruleName}</b>
          <div className="dw-muted dw-small">{RULE_GUIDE[h.ruleCode as RuleCode]?.group ?? ''}</div>
        </div>
      ),
    },
    {
      title: '결과',
      key: 'outcome',
      width: 90,
      render: (_, h) => {
        if (h.outcome === 'UNAVAILABLE') return <Tag>확인 불가</Tag>
        if (h.outcome === 'NO_MATCH') return <Tag>미적중</Tag>
        return <Tag color="red">{h.ruleCode === 'BLOCKLIST' ? '일치' : '적중'}</Tag>
      },
    },
    {
      title: '점수',
      key: 'score',
      width: 90,
      align: 'right',
      render: (_, h) =>
        h.ruleCode === 'BLOCKLIST' && h.outcome === 'MATCH' ? (
          <b>바로 차단</b>
        ) : h.appliedScore > 0 ? (
          <b>+{h.appliedScore}</b>
        ) : (
          <span className="dw-muted">0</span>
        ),
    },
    { title: '평가 당시 값', dataIndex: 'observedValue', render: (v: string | null) => v ?? '—' },
  ]
  return (
    <Card title="어떤 Rule에 걸렸나" extra={<Link to="/security/rules">Rule 카탈로그 →</Link>}>
      {detail.ruleHits.length === 0 ? (
        <p className="dw-muted">평가가 끝나지 않아 Rule 결과가 없습니다.</p>
      ) : (
        <Table
          rowKey="hitId"
          size="small"
          columns={columns}
          dataSource={detail.ruleHits}
          pagination={false}
          rowClassName={(h) => (h.outcome === 'MATCH' ? 'dw-pa-hit' : '')}
          summary={() =>
            blocked || e.riskScore === null ? null : (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>
                  <b>합계</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <b>{e.riskScore}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3}>{verdict(e).label}</Table.Summary.Cell>
              </Table.Summary.Row>
            )
          }
        />
      )}
    </Card>
  )
}

interface BlockModalProps {
  open: boolean
  candidates: BlockCandidate[]
  onClose: () => void
  onDone: () => void
}

// 고른 값만 차단 목록에 올린다. 공용 IP 같은 오등록을 막으려고 하나씩 고르게 한다
function BlockModal({ open, candidates, onClose, onDone }: BlockModalProps) {
  const { toast } = useFeedback()
  const [picked, setPicked] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const keyOf = (c: BlockCandidate) => `${c.type}:${c.value}`

  const close = () => {
    setPicked([])
    setReason('')
    onClose()
  }
  const submit = async () => {
    setSaving(true)
    try {
      const chosen = candidates.filter((c) => picked.includes(keyOf(c)))
      for (const c of chosen) {
        await addBlocklistEntry({ entryType: c.type, entryValue: c.value, reason: reason.trim() })
      }
      void toast.success(
        `${chosen.length}개 값을 차단 목록에 올렸습니다. 다음 결제부터 바로 막아요.`,
      )
      setPicked([])
      setReason('')
      onDone()
    } catch {
      void toast.error('등록하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title="차단 목록에 등록"
      okText="등록"
      cancelText="취소"
      okButtonProps={{ danger: true, disabled: picked.length === 0 || reason.trim().length < 5 }}
      confirmLoading={saving}
      onOk={() => void submit()}
      onCancel={close}
    >
      <p>
        등록한 값과 일치하는 결제는 점수 계산 없이 바로 거절돼요. 여러 사람이 함께 쓰는 값(회사 ·
        카페 IP 등)은 정상 고객까지 막을 수 있으니 확인 후 골라 주세요.
      </p>
      <Checkbox.Group value={picked} onChange={(v) => setPicked(v as string[])}>
        <div className="dw-pa-candidates">
          {candidates.map((c) => (
            <Checkbox key={keyOf(c)} value={keyOf(c)} disabled={c.already}>
              {c.label}
              {c.already && <Tag style={{ marginLeft: 8 }}>등록됨</Tag>}
            </Checkbox>
          ))}
        </div>
      </Checkbox.Group>
      <Input.TextArea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="등록 사유 (5자 이상) 예: 카드 테스팅 시도 · 사건 201 사기 판정"
        maxLength={200}
        showCount
        style={{ marginTop: 12 }}
      />
    </Modal>
  )
}

export function AlertDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<Data | 'missing' | null | undefined>(undefined)
  const [now, setNow] = useState(() => new Date())
  const [blockOpen, setBlockOpen] = useState(false)

  const apply = useCallback((result: Data | 'missing' | null) => {
    setNow(new Date())
    setData(result)
  }, [])
  const load = useCallback(() => fetchAlert(id).then(apply), [id, apply])

  useEffect(() => {
    let alive = true
    void fetchAlert(id).then((result) => {
      if (alive) apply(result)
    })
    return () => {
      alive = false
    }
  }, [id, apply])

  const facts = useMemo(
    () => (data && data !== 'missing' ? paymentFacts(data.detail, data.payment) : []),
    [data],
  )
  const candidates = useMemo(
    () => (data && data !== 'missing' ? blockCandidates(data.payment, data.blocklist) : []),
    [data],
  )

  const back = (
    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/security/alerts')}>
      목록
    </Button>
  )
  if (data === undefined) {
    return (
      <>
        <PageHeader title="결제 경보" actions={back} />
        <div className="dw-error-view" role="status">
          <Spin size="large" />
        </div>
      </>
    )
  }
  if (data === null || data === 'missing') {
    return (
      <>
        <PageHeader title="결제 경보" actions={back} />
        <Alert
          type="warning"
          showIcon
          message={data === 'missing' ? '찾는 경보가 없습니다.' : '경보를 불러오지 못했습니다.'}
          action={data === null && <Button onClick={() => void load()}>다시 시도</Button>}
        />
      </>
    )
  }

  const { detail, payment } = data
  const e = detail.evaluation
  const allBlocked = candidates.length > 0 && candidates.every((c) => c.already)
  const others = detail.history.filter((h) => h.evaluationId !== e.evaluationId)

  return (
    <>
      <PageHeader
        title={`${e.customerLabel} · ${koreanWon(e.amount)}`}
        description={`결제 경보 · ${relativeTime(e.evaluatedAt, now)} · ${e.orderTitle ?? '상품 정보 없음'}`}
        actions={
          <>
            {e.caseId && (
              <Link to={`/security/cases/${e.caseId}`}>
                <Button data-tour="alert-case-link">사건 보기</Button>
              </Link>
            )}
            {candidates.length > 0 &&
              (allBlocked ? (
                <Button disabled>차단 목록 등록됨</Button>
              ) : (
                <Button danger data-tour="alert-block" onClick={() => setBlockOpen(true)}>
                  차단 목록에 등록
                </Button>
              ))}
            {back}
          </>
        }
      />
      <div className="dw-pa-grid">
        <div className="dw-pa-col">
          <ScoreCard detail={detail} />
          <RuleTable detail={detail} />
        </div>
        <div className="dw-pa-col">
          <Card title="이 결제, 평소와 무엇이 다른가">
            <p className="dw-pa-head">
              <b>{e.customerLabel}</b> 고객님이 <b>{koreanWon(e.amount)}</b>을 결제했어요
              <span className="dw-muted dw-small">
                {' '}
                · {relativeTime(e.paymentRequestedAt, now)}
              </span>
            </p>
            {facts.map((f, i) => (
              <FactRow key={i} fact={f} />
            ))}
            {isBlocklisted(e) && (
              <p className="dw-muted dw-small">
                차단 목록과 일치하면 바로 막기 때문에 카드 · 접속 · 기기를 평소와 비교하지 않았어요.
              </p>
            )}
            {!payment && <p className="dw-muted">결제 정보를 불러오지 못했습니다.</p>}
            <RawDetails
              title="원본 값 보기 (주문번호 · 이메일 · IP · 기기 ID)"
              rows={[
                ['주문번호', payment?.orderRef ?? '—'],
                ['결제 번호', e.paymentId],
                ['고객 번호', e.customerRef],
                ['이메일', payment?.buyerEmail ?? '—'],
                ['카드', payment?.cardLast4 ? `**** ${payment.cardLast4}` : '—'],
                ['IP', payment?.clientIp ?? '—'],
                ['기기 ID', payment?.deviceId ?? '—'],
                ['평가 번호', e.evaluationId],
                ['오류 코드', e.errorCode ?? '—'],
              ]}
            />
          </Card>
          {others.length > 0 && (
            <Card title="이 고객의 다른 결제">
              {others.map((h) => {
                const v = verdict(h)
                return (
                  <Link key={h.evaluationId} to={`/security/alerts/${h.evaluationId}`}>
                    <div className="dw-pa-other">
                      <span>
                        {koreanWon(h.amount)} · {h.orderTitle ?? '상품 정보 없음'}
                      </span>
                      <span>
                        <Tag color={TONE_COLOR[v.tone]}>{v.label}</Tag>
                        <span className="dw-muted dw-small">
                          {relativeTime(h.evaluatedAt, now)}
                        </span>
                      </span>
                    </div>
                  </Link>
                )
              })}
            </Card>
          )}
          <p className="dw-muted dw-small">
            CakeShop이 결제 요청에 구매자 이메일 · IP · 기기 정보를 함께 보냅니다. 사장님 · 구매자
            화면에는 점수와 <TermTip term="RULE" />을 보여 주지 않아요.
          </p>
        </div>
      </div>
      <BlockModal
        open={blockOpen}
        candidates={candidates}
        onClose={() => setBlockOpen(false)}
        onDone={() => {
          setBlockOpen(false)
          void load()
        }}
      />
    </>
  )
}
