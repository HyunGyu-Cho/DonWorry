import { Alert, Button, Card, Input, Modal, Spin, Tabs, Tag } from 'antd'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { enableRule, getRuleHitStats, getRules } from '../../api/fdsRules'
import { RuleActionForbiddenError, RuleAlreadyEnabledError } from '../../api/fdsErrors'
import { createApproval, getApprovals } from '../../api/investigation'
import { ApprovalDuplicateError } from '../../api/investigationErrors'
import { useAuth } from '../../auth/useAuth'
import { useFeedback } from '../../components/common/Feedback'
import { PageHeader } from '../../components/common/PageHeader'
import { RawDetails } from '../../components/explain/RawDetails'
import { TermTip } from '../../components/explain/TermTip'
import { resultForScore, RULE_GUIDE, SCORE_BANDS } from '../../config/fdsRules'
import type { FdsRule, RuleCode, RuleHitStat, RuleTarget } from '../../types/fds'
import type { ApprovalRequest } from '../../types/investigation'
import { relativeTime } from '../../utils/humanize'
import {
  canToggle,
  HIT_DAYS,
  pendingDisables,
  ruleState,
  type RuleState,
} from '../../utils/ruleCatalog'

type Data = { rules: FdsRule[]; stats: RuleHitStat[]; approvals: ApprovalRequest[] }
type TabKey = RuleTarget | 'ALL'

const STATE_TAG: Record<RuleState, [string, string]> = {
  ON: ['사용 중', 'green'],
  JUST_HIT: ['방금 적중', 'red'],
  OFF: ['꺼짐', 'default'],
}
const BAND_LABEL: Record<string, string> = { ALLOW: '통과', REVIEW: '직원 확인', DENY: '거절' }
// 위쪽 안내 카드의 점수 예시 — 점수는 실제 Rule 값으로 계산한다
const EXAMPLES: { codes: RuleCode[]; story: string }[] = [
  {
    codes: ['HIGH_AMOUNT', 'AMOUNT_SPIKE', 'NEW_CARD'],
    story: '65만 원 · 평소 5배 · 처음 쓰는 카드',
  },
  {
    codes: ['CARD_TESTING', 'NEW_ACCOUNT', 'GEO_MISMATCH'],
    story: '같은 IP 카드 3장 · 신규 계정 · 해외 익명 IP',
  },
]

// 화면에 필요한 기록을 한 번에 가져온다. 하나라도 실패하면 null
async function fetchCatalog(): Promise<Data | null> {
  try {
    const [rules, stats, approvals] = await Promise.all([
      getRules(),
      getRuleHitStats(HIT_DAYS),
      getApprovals('PENDING'),
    ])
    return { rules, stats, approvals }
  } catch {
    return null
  }
}

// 7일 하루별 적중 막대 (오래된 날 → 오늘)
function Sparkline({ daily, color }: { daily: number[]; color: string }) {
  const max = Math.max(1, ...daily)
  return (
    <svg
      className="dw-spark"
      viewBox={`0 0 ${daily.length * 10} 28`}
      role="img"
      aria-label={`최근 ${daily.length}일 하루별 적중 ${daily.join(', ')}건`}
    >
      {daily.map((n, i) => {
        const h = n === 0 ? 2 : 4 + (n / max) * 24
        return (
          <rect
            key={i}
            x={i * 10 + 1}
            y={28 - h}
            width={8}
            height={h}
            rx={1.5}
            fill={n === 0 ? '#e2e8f0' : color}
          />
        )
      })}
    </svg>
  )
}

function ScoreGuide({ rules }: { rules: FdsRule[] }) {
  const scoreOf = (code: RuleCode) => rules.find((r) => r.ruleCode === code)?.score ?? 0
  const bands = [...SCORE_BANDS].reverse()
  return (
    <Card className="dw-rule-intro">
      <div className="dw-rule-intro-title">결제 룰 · 판정 순서</div>
      <ol className="dw-rule-steps">
        <li>
          <TermTip term="BLOCKLIST" />에 있으면 점수 계산 없이 바로 거절
        </li>
        <li>
          아니면 걸린 <TermTip term="RULE" /> 점수를 모두 더하기
        </li>
        <li>
          합계가 어느 <TermTip term="SCORE_BAND" />에 드는지로 판정
        </li>
      </ol>
      <div className="dw-rule-scale">
        {bands.map((band, i) => {
          const next = bands[i + 1]
          const range = next ? `${band.min}~${next.min - 1}점` : `${band.min}점 이상`
          return (
            <div key={band.result} className={`dw-rule-band-${band.result}`} title={band.meaning}>
              {BAND_LABEL[band.result]} {range}
            </div>
          )
        })}
      </div>
      {EXAMPLES.map((ex) => {
        const total = ex.codes.reduce((sum, code) => sum + scoreOf(code), 0)
        const parts = ex.codes.map((code) => `+${scoreOf(code)}`).join(' ')
        return (
          <p key={ex.story} className="dw-rule-example">
            예) {ex.story} ({parts}) ={' '}
            <b>
              {total}점 → {BAND_LABEL[resultForScore(total)]}
            </b>
          </p>
        )
      })}
    </Card>
  )
}

function StaffDefenseGuide() {
  return (
    <Card className="dw-rule-intro">
      <div className="dw-rule-intro-title">직원 룰 · 탐지와 통제 두 겹</div>
      <p className="dw-muted">
        직원 계정이 뚫리면 의심 결제를 허용하거나 Rule을 끌 수 있어서, 이상한 접속을 찾는 것과 함께
        중요한 행동에 한 번 더 확인을 받습니다.
      </p>
      <div className="dw-defense">
        <div>
          <b>
            <TermTip term="OTP">2단계 인증</TermTip>
          </b>
          <span>비밀번호 + 인증 앱 6자리</span>
        </div>
        <div>
          <b>
            <TermTip term="REAUTH" />
          </b>
          <span>AI 권고와 반대로 매입을 허용할 때 OTP 다시 입력</span>
        </div>
        <div>
          <b>
            <TermTip term="TWO_PERSON" />
          </b>
          <span>권고 반대 판정 · Rule 끄기는 관리자 승인 후 반영</span>
        </div>
      </div>
    </Card>
  )
}

interface RuleCardProps {
  rule: FdsRule
  stat: RuleHitStat | undefined
  pending: ApprovalRequest | undefined
  now: Date
  canAct: boolean
  approvalsPath: string | null
  busy: boolean
  onDisable: (rule: FdsRule) => void
  onEnable: (rule: FdsRule) => void
}

function RuleCard(props: RuleCardProps) {
  const { rule, stat, pending, now, canAct, approvalsPath, busy } = props
  const guide = RULE_GUIDE[rule.ruleCode]
  const state = ruleState(rule, stat, now)
  const staff = rule.target === 'STAFF'
  const color = staff ? '#db2777' : '#2563eb'

  // 오른쪽 아래: 끌 수 없는 Rule 안내 · 승인 대기 · 버튼
  let control: ReactNode = null
  if (!canToggle(rule)) {
    control = (
      <span className="dw-muted dw-small">
        {staff ? '항상 켜짐 · 직원 계정 보호' : '항상 켜짐 · 재범 방지'}
      </span>
    )
  } else if (!rule.enabled) {
    control = canAct && (
      <Button size="small" loading={busy} onClick={() => props.onEnable(rule)}>
        다시 켜기
      </Button>
    )
  } else if (pending) {
    const tag = <Tag color="gold">끄기 승인 대기</Tag>
    control = (
      <span className="dw-small" title={`${pending.requestedByName} 요청 · ${pending.reason}`}>
        {approvalsPath ? <Link to={approvalsPath}>{tag}</Link> : tag}
      </span>
    )
  } else if (canAct) {
    control = (
      <Button size="small" onClick={() => props.onDisable(rule)}>
        끄기 요청
      </Button>
    )
  }

  return (
    <article className={`dw-rule-card${state === 'OFF' ? ' is-off' : ''}`}>
      <div className="dw-rule-card-head">
        <Tag color={staff ? 'magenta' : 'blue'}>
          {staff ? '직원' : '결제'} · {guide.group}
        </Tag>
        <Tag color={STATE_TAG[state][1]}>{STATE_TAG[state][0]}</Tag>
      </div>
      <h3>{rule.displayName}</h3>
      <dl className="dw-rule-rows">
        <dt>기준</dt>
        <dd>{rule.criteria}</dd>
        <dt>결과</dt>
        <dd>
          <b>{guide.effect}</b>
        </dd>
        <dt>예시</dt>
        <dd>{guide.example}</dd>
        <dt>단독으론</dt>
        <dd className="dw-muted">{guide.alone.replace(/^단독으론\s*/, '')}</dd>
      </dl>
      <div className="dw-rule-foot">
        <div>
          <div className="dw-muted dw-small">최근 {HIT_DAYS}일 적중</div>
          <div className="dw-rule-count" style={{ color }}>
            {stat?.total ?? 0}
            <small>건</small>
          </div>
          <div className="dw-muted dw-small">
            {stat?.lastHitAt ? `마지막 ${relativeTime(stat.lastHitAt, now)}` : '적중 없음'}
          </div>
        </div>
        <div className="dw-rule-foot-right">
          {stat && <Sparkline daily={stat.daily} color={color} />}
          {control}
        </div>
      </div>
      <RawDetails
        title="원본 값"
        rows={[
          ['Rule 코드', rule.ruleCode],
          ['rule_id', rule.ruleId],
          ['점수', rule.score],
          ['기준값', rule.threshold ? JSON.stringify(rule.threshold) : '없음'],
          ['마지막 변경', rule.updatedAt],
        ]}
      />
    </article>
  )
}

export function RuleCatalogPage() {
  const { user } = useAuth()
  const { toast } = useFeedback()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<TabKey>('PAYMENT')
  const [now, setNow] = useState(() => new Date())
  const [busy, setBusy] = useState<number | null>(null)
  const [disabling, setDisabling] = useState<FdsRule | null>(null)
  const [reason, setReason] = useState('')

  // 끄기 요청 · 다시 켜기는 보안 직원만. 관리자는 승인함에서 승인한다
  const canAct = user?.role === 'SECURITY_STAFF'
  const approvalsPath = user?.role === 'SECURITY_MANAGER' ? '/manager/approvals' : null

  // 오류 표시는 결과가 온 뒤에만 바꾼다
  const apply = useCallback((result: Data | null) => {
    if (!result) {
      setError(true)
      return
    }
    setNow(new Date())
    setData(result)
    setError(false)
  }, [])
  const load = useCallback(() => fetchCatalog().then(apply), [apply])

  useEffect(() => {
    let alive = true
    void fetchCatalog().then((result) => {
      if (alive) apply(result)
    })
    return () => {
      alive = false
    }
  }, [apply])

  const pending = useMemo(
    () => (data ? pendingDisables(data.approvals) : new Map<number, ApprovalRequest>()),
    [data],
  )

  const enable = async (rule: FdsRule) => {
    setBusy(rule.ruleId)
    try {
      await enableRule(rule.ruleId)
      void toast.success(`"${rule.displayName}" Rule을 다시 켰습니다. 다음 결제부터 적용돼요.`)
      await load()
    } catch (e) {
      void toast.error(
        e instanceof RuleActionForbiddenError || e instanceof RuleAlreadyEnabledError
          ? e.message
          : '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setBusy(null)
    }
  }

  const submitDisable = async () => {
    if (!disabling) return
    const rule = disabling
    try {
      await createApproval({
        requestType: 'RULE_DISABLE',
        targetType: 'FDS_RULE',
        targetId: rule.ruleId,
        targetLabel: `"${rule.displayName}" Rule`,
        payload: { enabled: false },
        reason: reason.trim(),
      })
      void toast.success('끄기 요청을 보냈습니다. 보안 관리자가 승인하면 꺼집니다.')
      setDisabling(null)
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
      title="Rule 카탈로그"
      description="돈워리가 어떤 규칙으로 이상 징후를 찾는지 봅니다. 결제 룰은 CakeShop 결제를, 직원 룰은 돈워리 직원 계정을 지킵니다."
    />
  )
  if (error) {
    return (
      <>
        {header}
        <Alert
          type="warning"
          showIcon
          message="Rule 목록을 불러오지 못했습니다."
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

  const count = (target: TabKey) =>
    data.rules.filter((r) => target === 'ALL' || r.target === target).length
  const shown = data.rules.filter((r) => tab === 'ALL' || r.target === tab)
  const statOf = (code: RuleCode) => data.stats.find((s) => s.ruleCode === code)

  return (
    <>
      {header}
      <div className="dw-rule-intro-grid">
        <ScoreGuide rules={data.rules} />
        <StaffDefenseGuide />
      </div>
      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(key as TabKey)}
        items={[
          { key: 'PAYMENT', label: `결제 룰 ${count('PAYMENT')}` },
          { key: 'STAFF', label: `직원 계정 룰 ${count('STAFF')}` },
          { key: 'ALL', label: `전체 ${count('ALL')}` },
        ]}
      />
      <div className="dw-rule-grid">
        {shown.map((rule) => (
          <RuleCard
            key={rule.ruleId}
            rule={rule}
            stat={statOf(rule.ruleCode)}
            pending={pending.get(rule.ruleId)}
            now={now}
            canAct={canAct}
            approvalsPath={approvalsPath}
            busy={busy === rule.ruleId}
            onDisable={setDisabling}
            onEnable={(r) => void enable(r)}
          />
        ))}
      </div>
      <p className="dw-muted dw-small dw-rule-note">
        점수와 기준값은 시연용입니다. Rule을 끄는 것(완화)은 담당자 승인이 필요하고, 다시 켜는
        것(강화)은 바로 반영됩니다.
      </p>
      <Modal
        open={disabling !== null}
        title={disabling ? `"${disabling.displayName}" Rule 끄기 요청` : ''}
        okText="승인 요청 보내기"
        cancelText="취소"
        okButtonProps={{ disabled: reason.trim().length < 5 }}
        onOk={() => void submitDisable()}
        onCancel={() => {
          setDisabling(null)
          setReason('')
        }}
      >
        <p>
          Rule을 끄면 이 규칙으로 찾던 이상 결제를 놓칠 수 있어요. 다른 보안 관리자가 승인해야
          꺼집니다.
        </p>
        <Input.TextArea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="끄려는 이유 (5자 이상) 예: 단체 주문 오탐이 많아 이번 주만 끕니다"
          maxLength={200}
          showCount
        />
      </Modal>
    </>
  )
}
