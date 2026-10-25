import { ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Segmented, Spin, Table, Tabs, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { StaffActionDoneError, StaffActionForbiddenError } from '../../api/auth'
import { getRules, getStaffAlerts } from '../../api/fdsRules'
import {
  getLoginEvents,
  getStaffAccounts,
  getStaffSessions,
  terminateStaffSession,
  unlockStaffAccount,
} from '../../api/identity'
import { getStaffCases } from '../../api/investigation'
import { PageHeader } from '../../components/common/PageHeader'
import { useFeedback } from '../../components/common/Feedback'
import { RawDetails } from '../../components/explain/RawDetails'
import { TermTip } from '../../components/explain/TermTip'
import type { StaffAccount, StaffLoginEvent, StaffSession } from '../../types/auth'
import type { FdsRule, StaffAlert } from '../../types/fds'
import type { StaffCase } from '../../types/investigation'
import { countryName, placeName, relativeTime } from '../../utils/humanize'
import {
  accessSummary,
  AUTH_FAIL_THRESHOLD,
  distributedAttack,
  loginHeatmap,
  PER_IP_THRESHOLD,
  suspiciousSessionIds,
  type HeatKind,
} from '../../utils/staffAccess'

type Data = {
  events: StaffLoginEvent[]
  sessions: StaffSession[]
  alerts: StaffAlert[]
  accounts: StaffAccount[]
  rules: FdsRule[]
  cases: StaffCase[]
}
type TabKey = 'alerts' | 'sessions' | 'logins' | 'staff'

const RESULT_LABEL: Record<StaffLoginEvent['result'], [string, string]> = {
  SUCCESS: ['성공', 'green'],
  BAD_PASSWORD: ['비밀번호 틀림', 'red'],
  BAD_OTP: ['OTP 틀림', 'red'],
  LOCKED: ['잠긴 계정', 'red'],
  UNKNOWN_USER: ['없는 아이디', 'red'],
}
const HEAT_LABEL: Record<HeatKind, string> = {
  NONE: '로그인 없음',
  OFFICE_OK: '사내 성공',
  OUTSIDE_OK: '사외 성공',
  FAIL: '실패 포함',
  OUTSIDE_FAIL: '사외 + 실패',
}
const ROLE_LABEL: Record<string, string> = {
  SECURITY_STAFF: '보안 직원',
  SECURITY_MANAGER: '보안 관리자',
}

// 사람 이름 + 사내/사외 꼬리표 (IP 원문은 쓰지 않는다)
function Place({ ip }: { ip: StaffLoginEvent['ip'] }) {
  return (
    <span>
      {placeName(ip.label)}
      {ip.ipType !== 'OFFICE' && (
        <Tag color="magenta" style={{ marginLeft: 6 }}>
          {ip.countryCode === 'KR' ? '사외' : countryName(ip.countryCode)}
        </Tag>
      )}
    </span>
  )
}

function Stat({
  label,
  value,
  unit,
  foot,
  color,
}: {
  label: string
  value: number
  unit: string
  foot: string
  color: string
}) {
  return (
    <div className="dw-panel dw-stat-card">
      <div className="dw-stat-label">{label}</div>
      <div className="dw-stat-value" style={{ color }}>
        {value}
        <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 3 }}>{unit}</span>
      </div>
      <div className="dw-stat-foot">{foot}</div>
    </div>
  )
}

// 화면에 필요한 기록을 한 번에 가져온다. 하나라도 실패하면 null
async function fetchAccessData(): Promise<Data | null> {
  try {
    const [events, sessions, alerts, accounts, rules, cases] = await Promise.all([
      getLoginEvents(),
      getStaffSessions(false),
      getStaffAlerts(),
      getStaffAccounts(),
      getRules(),
      getStaffCases(),
    ])
    return { events, sessions, alerts, accounts, rules, cases }
  } catch {
    return null
  }
}

export function StaffAccessPage() {
  const { toast } = useFeedback()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<TabKey>('alerts')
  const [attackView, setAttackView] = useState<'ip' | 'account'>('ip')
  const [busy, setBusy] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

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
  const load = useCallback(() => fetchAccessData().then(apply), [apply])

  useEffect(() => {
    let alive = true
    void fetchAccessData().then((result) => {
      if (alive) apply(result)
    })
    return () => {
      alive = false
    }
  }, [apply])

  const summary = useMemo(
    () => data && accessSummary(data.events, data.sessions, data.alerts.length, now),
    [data, now],
  )
  const attack = useMemo(() => data && distributedAttack(data.events, now), [data, now])
  const suspicious = useMemo(
    () => (data ? suspiciousSessionIds(data.sessions) : new Set<number>()),
    [data],
  )

  // 세션 종료 · 잠금 해제 — 실패해도 화면은 그대로 두고 이유만 알려 준다
  const act = async (key: string, task: () => Promise<unknown>, done: string) => {
    setBusy(key)
    try {
      await task()
      void toast.success(done)
      await load()
    } catch (e) {
      void toast.error(
        e instanceof StaffActionForbiddenError || e instanceof StaffActionDoneError
          ? e.message
          : '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setBusy(null)
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="로그인 모니터링" />
        <Alert
          type="warning"
          showIcon
          message="접속 기록을 불러오지 못했습니다."
          action={<Button onClick={() => void load()}>다시 시도</Button>}
        />
      </>
    )
  }
  if (!data || !summary) {
    return (
      <>
        <PageHeader title="로그인 모니터링" />
        <div className="dw-error-view" role="status">
          <Spin size="large" />
        </div>
      </>
    )
  }

  const ruleName = (code: string) =>
    data.rules.find((r) => r.ruleCode === code)?.displayName ?? code
  const caseOf = (hitId: number) => data.cases.find((c) => c.staffHitIds.includes(hitId))
  const heat = loginHeatmap(data.events, now)
  // 시도한 아이디 → 직원 이름 (없는 아이디면 그대로 알린다)
  const nameOfLogin = (loginId: string) => {
    const userId = data.events.find((e) => e.loginIdAttempted === loginId)?.userId
    return data.accounts.find((a) => a.userId === userId)?.displayName ?? '없는 아이디'
  }

  const alertColumns: ColumnsType<StaffAlert> = [
    {
      title: '언제',
      dataIndex: 'detectedAt',
      width: 120,
      render: (v: string) => relativeTime(v, now),
    },
    { title: '걸린 규칙', dataIndex: 'ruleCode', width: 190, render: (v: string) => ruleName(v) },
    { title: '무슨 일', dataIndex: 'summary' },
    {
      title: '위험도',
      dataIndex: 'severity',
      width: 90,
      render: (v: StaffAlert['severity']) =>
        v === 'HIGH' ? <Tag color="red">높음</Tag> : <Tag color="gold">주의</Tag>,
    },
    {
      title: '',
      width: 120,
      render: (_, a) => {
        const c = caseOf(a.staffHitId)
        return c ? <Link to={`/manager/cases/${c.caseId}`}>사건 보기 →</Link> : <span>-</span>
      },
    },
  ]

  const sessionColumns: ColumnsType<StaffSession> = [
    { title: '직원', dataIndex: 'displayName', width: 110 },
    {
      title: '어디서 · 기기',
      render: (_, s) => (
        <div>
          <Place ip={s.ip} />
          <div className="dw-muted-small">{s.deviceLabel ?? '알 수 없는 기기'}</div>
        </div>
      ),
    },
    {
      title: '시작',
      dataIndex: 'startedAt',
      width: 120,
      render: (v: string) => relativeTime(v, now),
    },
    {
      title: '상태',
      width: 160,
      render: (_, s) =>
        s.endedAt ? (
          <Tag>{s.endReason === 'FORCED' ? '강제 종료' : '끝남'}</Tag>
        ) : suspicious.has(s.staffSessionId) ? (
          <Tooltip title="같은 직원의 사내 세션과 동시에 쓰이고 있어요">
            <Tag color="red">사용 중 · 탈취 의심</Tag>
          </Tooltip>
        ) : (
          <Tag color="green">사용 중</Tag>
        ),
    },
    {
      title: '',
      width: 90,
      render: (_, s) =>
        s.endedAt ? null : (
          <Button
            size="small"
            danger={suspicious.has(s.staffSessionId)}
            loading={busy === `s${s.staffSessionId}`}
            onClick={() =>
              void act(
                `s${s.staffSessionId}`,
                () => terminateStaffSession(s.staffSessionId),
                `${s.displayName} 세션을 종료했습니다. 이 기기는 다시 로그인해야 합니다.`,
              )
            }
          >
            종료
          </Button>
        ),
    },
  ]

  const loginColumns: ColumnsType<StaffLoginEvent> = [
    {
      title: '언제',
      dataIndex: 'occurredAt',
      width: 120,
      render: (v: string) => relativeTime(v, now),
    },
    {
      title: '직원',
      width: 130,
      render: (_, e) =>
        data.accounts.find((a) => a.userId === e.userId)?.displayName ?? `없는 아이디`,
    },
    { title: '어디서', render: (_, e) => <Place ip={e.ip} /> },
    {
      title: '결과',
      dataIndex: 'result',
      width: 130,
      render: (v: StaffLoginEvent['result']) => (
        <Tag color={RESULT_LABEL[v][1]}>{RESULT_LABEL[v][0]}</Tag>
      ),
    },
    { title: '기기', dataIndex: 'deviceLabel', width: 200, render: (v: string | null) => v ?? '-' },
  ]

  const accountColumns: ColumnsType<StaffAccount> = [
    { title: '직원', dataIndex: 'displayName', width: 110, render: (v: string) => <b>{v}</b> },
    { title: '역할', dataIndex: 'role', width: 110, render: (v: string) => ROLE_LABEL[v] ?? v },
    {
      title: '계정 상태',
      width: 260,
      render: (_, a) =>
        a.locked ? (
          <div>
            <Tag color="red">잠김</Tag>
            <span className="dw-muted-small">{a.lockedReason}</span>
          </div>
        ) : (
          <Tag color="green">정상</Tag>
        ),
    },
    {
      title: <TermTip term="OTP">OTP</TermTip>,
      width: 100,
      render: (_, a) => (a.otpEnrolled ? <Tag color="green">등록됨</Tag> : <Tag>미등록</Tag>),
    },
    {
      title: '등록된 업무 PC',
      render: (_, a) =>
        a.workPc ? placeName(a.workPc.label) : <span className="dw-muted-small">없음</span>,
    },
    {
      title: '마지막 로그인',
      width: 150,
      render: (_, a) =>
        a.lastLoginAt ? (
          <div>
            {relativeTime(a.lastLoginAt, now)}
            <div className="dw-muted-small">{a.lastLoginOutside ? '사내망 밖' : '사내'}</div>
          </div>
        ) : (
          '기록 없음'
        ),
    },
    {
      title: '',
      width: 140,
      render: (_, a) =>
        a.locked ? (
          <Tooltip title="본인 확인 · 비밀번호와 OTP 재등록을 마친 뒤에 풀어 주세요">
            <Button
              size="small"
              type="primary"
              loading={busy === `u${a.userId}`}
              onClick={() =>
                void act(
                  `u${a.userId}`,
                  () => unlockStaffAccount(a.userId),
                  `${a.displayName} 계정 잠금을 풀었습니다.`,
                )
              }
            >
              잠금 해제
            </Button>
          </Tooltip>
        ) : null,
    },
  ]

  const active = data.sessions.filter((s) => s.endedAt === null)

  return (
    <>
      <PageHeader
        title="로그인 모니터링"
        description="돈워리 직원(보안 직원 · 관리자) 계정의 로그인과 세션을 모니터링해요. 직원은 보통 사내망 업무 PC 한두 대에서 비밀번호 + OTP로 로그인해요."
        actions={
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            새로고침
          </Button>
        }
      />

      <div className="dw-stat-grid">
        <Stat
          label="진행 중인 세션"
          value={summary.activeSessions}
          unit="개"
          color="#2563EB"
          foot={
            summary.suspiciousSessions ? `탈취 의심 ${summary.suspiciousSessions}개` : '모두 사내망'
          }
        />
        <Stat
          label="오늘 인증 실패"
          value={summary.todayFailures}
          unit="회"
          color="#D97706"
          foot={`10분에 ${AUTH_FAIL_THRESHOLD}회 이상이면 경보`}
        />
        <Stat
          label="사내망 밖 접속"
          value={summary.outsideLogins7d}
          unit="회"
          color="#DB2777"
          foot="최근 7일 · 재택 포함"
        />
        <Stat
          label="직원 경보"
          value={summary.staffAlerts}
          unit="건"
          color="#DC2626"
          foot="사건으로 묶여 관리자가 판정"
        />
      </div>

      {attack && (
        <Card
          className="dw-attack-card"
          title="여러 IP로 나눠 들어오는 로그인 시도"
          extra={
            <Segmented
              size="small"
              data-tour="access-by-account"
              value={attackView}
              onChange={(v) => setAttackView(v as 'ip' | 'account')}
              options={[
                { label: 'IP별로 보기', value: 'ip' },
                { label: '계정별로 묶어 보기', value: 'account' },
              ]}
            />
          }
          style={{ marginBottom: 20 }}
        >
          {/* 처음 보는 사람용 한 줄 — 왜 IP가 여러 개면 문제인지 */}
          <p className="dw-attack-why">
            보통은 "같은 IP가 10분에 {PER_IP_THRESHOLD}번 틀리면 차단"으로 막아요. 공격자는 이걸
            피하려고 IP를 수십 개로 나눠 하나당 1~3번씩만 시도해요. 그래서 IP마다 세면 안 걸리고,
            <b> 계정 기준으로 묶어야</b> 공격이 보여요.
          </p>
          {attackView === 'ip' ? (
            <>
              <p className="dw-attack-lead">
                최근 10분, 사내망 밖 IP <b>{attack.ips.length}개</b>가 1~
                {Math.max(...attack.ips.map((i) => i.failures))}번씩 실패했어요.{' '}
                {attack.belowPerIpThreshold &&
                  `IP 하나씩 보면 모두 "10분 ${PER_IP_THRESHOLD}회" 기준 아래라 기존 규칙으로는 경보가 없어요.`}
              </p>
              <div className="dw-ip-dots" aria-label="IP별 실패 횟수">
                {attack.ips.map((ip) => (
                  <Tooltip
                    key={ip.address}
                    title={`${countryName(ip.countryCode)} · 실패 ${ip.failures}회`}
                  >
                    <span className={`dw-ip-dot dw-ip-dot-${Math.min(ip.failures, 3)}`}>
                      {ip.failures}
                    </span>
                  </Tooltip>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="dw-attack-lead">
                계정 기준으로 묶으면 <b>{attack.totalFailures}회</b> 실패예요. 하나씩 보면 정상,
                묶어야 보이는 공격입니다.
              </p>
              <div className="dw-attack-accounts">
                {attack.byAccount.map((a) => (
                  <div key={a.loginId} className="dw-attack-account">
                    <b>{nameOfLogin(a.loginId)}</b>
                    <span>
                      IP {a.ips}개에서 실패 <b>{a.failures}회</b>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as TabKey)}
        items={[
          {
            key: 'alerts',
            label: `직원 경보 ${data.alerts.length}`,
            children: (
              <Card className="dw-table-card">
                <Table
                  rowKey="staffHitId"
                  columns={alertColumns}
                  dataSource={data.alerts}
                  pagination={false}
                  locale={{
                    emptyText: '직원 경보가 없습니다. 이상한 로그인이 생기면 여기에 먼저 뜹니다.',
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'sessions',
            label: `세션 ${active.length}`,
            children: (
              <Card
                className="dw-table-card"
                title={
                  <span>
                    <TermTip term="SESSION" /> — 로그인한 뒤 받은 접속 열쇠
                  </span>
                }
              >
                <Table
                  rowKey="staffSessionId"
                  columns={sessionColumns}
                  dataSource={data.sessions}
                  rowClassName={(s) =>
                    suspicious.has(s.staffSessionId) && !s.endedAt ? 'dw-row-warn' : ''
                  }
                  pagination={false}
                />
                <RawDetails
                  title="세션 원본 값 펼치기"
                  rows={data.sessions.map((s): [string, string] => [
                    `${s.displayName} · 세션 ${s.staffSessionId}`,
                    `${s.ip.address} · ${s.deviceId ?? '-'}`,
                  ])}
                />
              </Card>
            ),
          },
          {
            key: 'logins',
            label: `로그인 기록 ${data.events.length}`,
            children: (
              <>
                <Card
                  title="7일 × 24시간 직원 로그인 지도"
                  extra={
                    <span className="dw-heat-legend">
                      {(['OFFICE_OK', 'OUTSIDE_OK', 'FAIL', 'OUTSIDE_FAIL'] as HeatKind[]).map(
                        (k) => (
                          <span key={k}>
                            <i className={`dw-heat-${k}`} />
                            {HEAT_LABEL[k]}
                          </span>
                        ),
                      )}
                    </span>
                  }
                  style={{ marginBottom: 16 }}
                >
                  <div className="dw-heat" role="img" aria-label="최근 7일 시간대별 로그인">
                    <span />
                    {Array.from({ length: 24 }, (_, h) => (
                      <span key={h} className="dw-heat-hour">
                        {h % 3 === 0 ? h : ''}
                      </span>
                    ))}
                    {heat.map((row, r) => (
                      <div key={r} className="dw-heat-row">
                        <span className="dw-heat-day">
                          {r === 6 ? '오늘' : r === 5 ? '어제' : `${6 - r}일 전`}
                        </span>
                        {row.map((cell, h) => (
                          <Tooltip
                            key={h}
                            title={`${h}시 · ${HEAT_LABEL[cell.kind]}${cell.kind === 'NONE' ? '' : ` · 성공 ${cell.success} · 실패 ${cell.failure}`}`}
                          >
                            <span className={`dw-heat-cell dw-heat-${cell.kind}`} />
                          </Tooltip>
                        ))}
                      </div>
                    ))}
                  </div>
                  <p className="dw-muted-small" style={{ marginTop: 10 }}>
                    직원은 평소 아침 8시 40분쯤 사내 업무 PC에서 접속합니다. 평소와 다른 칸이 분홍 ·
                    빨강으로 보입니다.
                  </p>
                </Card>
                <Card className="dw-table-card" title="최근 로그인 기록 20건">
                  <Table
                    rowKey="loginEventId"
                    columns={loginColumns}
                    dataSource={data.events.slice(0, 20)}
                    rowClassName={(e) =>
                      e.result !== 'SUCCESS' && e.ip.ipType !== 'OFFICE' ? 'dw-row-warn' : ''
                    }
                    pagination={false}
                  />
                </Card>
              </>
            ),
          },
          {
            key: 'staff',
            label: `직원 정보 ${data.accounts.length}`,
            children: (
              <Card className="dw-table-card">
                <Table
                  rowKey="userId"
                  columns={accountColumns}
                  dataSource={data.accounts}
                  rowClassName={(a) => (a.locked ? 'dw-row-warn' : '')}
                  pagination={false}
                />
                <RawDetails
                  title="업무 PC 원본 값 펼치기"
                  rows={data.accounts.map((a): [string, string] => [
                    a.displayName,
                    a.workPc?.address ?? '-',
                  ])}
                />
              </Card>
            ),
          },
        ]}
      />
    </>
  )
}
