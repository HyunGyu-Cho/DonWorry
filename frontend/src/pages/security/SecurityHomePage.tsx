import { Tag } from 'antd'
import { useState } from 'react'
import { getCases, getHandoffs } from '../../api/cases'
import { getFdsEvaluations } from '../../api/fds'
import { getRuleHitStats, getRules } from '../../api/fdsRules'
import { HomeFrame } from '../../components/home/HomeFrame'
import { HomeList, HomeRow, HomeTile } from '../../components/home/HomeParts'
import { useLoad } from '../../components/home/useLoad'
import { useDemo } from '../../demo/DemoContext'
import { koreanWon, relativeTime } from '../../utils/humanize'
import { caseGroupCounts, inGroup, latest, openHandoffs, topRules } from '../../utils/homeView'
import { TONE_COLOR, verdict } from '../../utils/paymentAlert'
import { caseTypeLabel } from './case/caseLabels'

async function fetchHome(merchant: string) {
  const [cases, alerts, handoffs, stats, rules] = await Promise.all([
    getCases(merchant),
    getFdsEvaluations({ attentionOnly: true }),
    getHandoffs(),
    getRuleHitStats(7),
    getRules(),
  ])
  return { cases, alerts, handoffs, stats, rules }
}

// 보안 직원 홈 — 오늘 처리할 일 3칸 + AI 조사 중 사건 · 최근 경보 · 많이 걸린 Rule
export function SecurityHomePage() {
  const { merchant } = useDemo()
  const { value, retry } = useLoad(() => fetchHome(merchant), merchant)
  const [now] = useState(() => new Date())
  const state = value === null ? 'loading' : value === 'error' ? 'error' : 'ready'

  return (
    <HomeFrame
      title="홈"
      description="오늘 처리할 일부터 보여 드려요. 칸을 누르면 그 화면으로 가요."
      state={state}
      onRetry={retry}
    >
      {value && value !== 'error' && <SecurityHomeBody data={value} now={now} />}
    </HomeFrame>
  )
}

function SecurityHomeBody({
  data,
  now,
}: {
  data: Awaited<ReturnType<typeof fetchHome>>
  now: Date
}) {
  const { cases, alerts, handoffs, stats, rules } = data
  const groups = caseGroupCounts(cases)
  const counts = alerts.resultCounts
  const attention = counts.REVIEW + counts.DENY + counts.ERROR
  const actions = openHandoffs(handoffs)
  const investigating = cases.filter((c) => inGroup(c.status, 'AI'))
  const ruleName = (code: string) => rules.find((r) => r.ruleCode === code)?.displayName ?? code

  return (
    <>
      <div className="dw-home-tiles">
        <HomeTile
          to="/security/cases"
          label="판정 대기 사건"
          value={`${groups.DECISION}건`}
          note="AI 보고서를 보고 매입 허용 · 승인 취소를 정해 주세요"
          tone={groups.DECISION > 0 ? 'bad' : 'ok'}
        />
        <HomeTile
          to="/security/alerts"
          label="확인할 결제 경보"
          value={`${attention}건`}
          note={`직원 확인 ${counts.REVIEW} · 거절 ${counts.DENY} · 평가 실패 ${counts.ERROR}`}
          tone={attention > 0 ? 'warn' : 'ok'}
        />
        <HomeTile
          to="/security/actions"
          label="조치 확인 필요"
          value={`${actions.open}건`}
          note={
            actions.failed > 0
              ? `실패 ${actions.failed}건 — 다시 요청해 주세요`
              : '결제 반영을 기다리는 조치'
          }
          tone={actions.failed > 0 ? 'bad' : actions.open > 0 ? 'warn' : 'ok'}
        />
      </div>
      <div className="dw-home-grid">
        <HomeList
          title="지금 AI가 조사 중인 사건"
          more={{ to: '/security/cases', label: '사건 목록' }}
          empty="조사 중인 사건이 없어요."
        >
          {investigating.map((c) => (
            <HomeRow
              key={c.caseId}
              to={`/security/cases/${c.caseId}`}
              title={
                <>
                  <span className="dw-live-dot" aria-hidden />
                  {c.subjectLabel} · {caseTypeLabel[c.caseType].label}
                </>
              }
              sub={`결제 ${c.paymentCount}건 · ${relativeTime(c.createdAt, now)} 시작`}
              side={c.totalAmount === null ? null : koreanWon(c.totalAmount)}
            />
          ))}
        </HomeList>
        <HomeList
          title="최근 결제 경보"
          more={{ to: '/security/alerts', label: '결제 경보' }}
          empty="확인할 경보가 없어요."
        >
          {latest(alerts.content, (e) => e.evaluatedAt, 5).map((e) => {
            const v = verdict(e)
            return (
              <HomeRow
                key={e.evaluationId}
                to={`/security/alerts/${e.evaluationId}`}
                title={
                  <>
                    <Tag color={TONE_COLOR[v.tone]}>{v.label}</Tag>
                    {e.customerLabel} · {e.orderTitle ?? '상품 정보 없음'}
                  </>
                }
                sub={relativeTime(e.evaluatedAt, now)}
                side={koreanWon(e.amount)}
              />
            )
          })}
        </HomeList>
        <HomeList
          title="최근 7일 많이 걸린 Rule"
          more={{ to: '/security/rules', label: 'Rule 카탈로그' }}
          empty="최근 7일 동안 걸린 Rule이 없어요."
        >
          {topRules(stats).map((s) => (
            <HomeRow
              key={s.ruleCode}
              title={ruleName(s.ruleCode)}
              sub={s.lastHitAt ? `마지막 ${relativeTime(s.lastHitAt, now)}` : undefined}
              side={`${s.total}번`}
            />
          ))}
        </HomeList>
      </div>
    </>
  )
}
