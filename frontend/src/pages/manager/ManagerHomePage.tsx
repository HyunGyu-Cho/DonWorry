import { Tag } from 'antd'
import { useState } from 'react'
import { getCases } from '../../api/cases'
import { getApprovals, getAuditLogs, getStaffCases } from '../../api/investigation'
import { HomeFrame } from '../../components/home/HomeFrame'
import { HomeList, HomeRow, HomeTile } from '../../components/home/HomeParts'
import { useLoad } from '../../components/home/useLoad'
import { useDemo } from '../../demo/DemoContext'
import { APPROVAL_TYPE, auditActionText } from '../../utils/approvals'
import { placeName, relativeTime } from '../../utils/humanize'
import { CASE_GROUP, CASE_GROUP_ORDER, caseGroupCounts, latest } from '../../utils/homeView'
import { caseTypeLabel } from '../security/case/caseLabels'

async function fetchHome(merchant: string) {
  const [approvals, staffCases, payCases, audit] = await Promise.all([
    getApprovals('PENDING'),
    getStaffCases(),
    getCases(merchant),
    getAuditLogs(),
  ])
  return { approvals, staffCases, payCases, audit }
}

// 보안 관리자 홈 — 관리자 승인 대기가 맨 앞, 이어서 직원 계정 사건 · 의심 접속 · 사건 현황
export function ManagerHomePage() {
  const { merchant } = useDemo()
  const { value, retry } = useLoad(() => fetchHome(merchant), merchant)
  const [now] = useState(() => new Date())
  const state = value === null ? 'loading' : value === 'error' ? 'error' : 'ready'
  return (
    <HomeFrame
      title="홈"
      description="관리자만 할 수 있는 일부터 보여 드려요. 칸을 누르면 그 화면으로 가요."
      state={state}
      onRetry={retry}
    >
      {value && value !== 'error' && <ManagerHomeBody data={value} now={now} />}
    </HomeFrame>
  )
}

function ManagerHomeBody({
  data,
  now,
}: {
  data: Awaited<ReturnType<typeof fetchHome>>
  now: Date
}) {
  const { approvals, staffCases, payCases, audit } = data
  const openStaff = staffCases.filter((c) => c.status !== 'CLOSED')
  const suspicious = audit.filter((a) => a.suspiciousSession)
  const groups = caseGroupCounts([...payCases, ...staffCases])
  const risky = approvals.filter((a) => a.riskStaffHitIds.length > 0).length

  return (
    <>
      <div className="dw-home-tiles">
        <HomeTile
          to="/manager/approvals"
          label="관리자 승인 대기"
          value={`${approvals.length}건`}
          note={
            risky > 0
              ? `의심 세션에서 온 요청 ${risky}건 — 먼저 확인하세요`
              : '직원이 요청한 판정 · Rule · 차단 해제'
          }
          tone={risky > 0 ? 'bad' : approvals.length > 0 ? 'warn' : 'ok'}
        />
        <HomeTile
          to="/manager/cases"
          label="직원 계정 사건"
          value={`${openStaff.length}건`}
          note="끝나지 않은 계정 공격 · 탈취 의심"
          tone={openStaff.length > 0 ? 'bad' : 'ok'}
        />
        <HomeTile
          to="/manager/audit"
          label="의심 세션에서 한 행동"
          value={`${suspicious.length}건`}
          note="탈취가 의심되는 접속에서 남은 감사 로그"
          tone={suspicious.length > 0 ? 'warn' : 'ok'}
        />
      </div>
      <div className="dw-home-grid">
        <HomeList
          title="승인을 기다리는 요청"
          more={{ to: '/manager/approvals', label: '관리자 승인함' }}
          empty="기다리는 요청이 없어요."
        >
          {latest(approvals, (a) => a.requestedAt, 4).map((a) => (
            <HomeRow
              key={a.approvalId}
              to="/manager/approvals"
              title={
                <>
                  <Tag color={APPROVAL_TYPE[a.requestType].color}>
                    {APPROVAL_TYPE[a.requestType].label}
                  </Tag>
                  {a.targetLabel}
                </>
              }
              sub={`${a.requestedByName} · ${relativeTime(a.requestedAt, now)}`}
              side={a.riskStaffHitIds.length > 0 ? <Tag color="red">위험</Tag> : null}
            />
          ))}
        </HomeList>
        <HomeList
          title="직원 계정 사건"
          more={{ to: '/manager/cases', label: '사건 목록' }}
          empty="끝나지 않은 직원 사건이 없어요."
        >
          {latest(openStaff, (c) => c.createdAt, 4).map((c) => (
            <HomeRow
              key={c.caseId}
              to={`/manager/cases/${c.caseId}`}
              title={`${c.subjectLabel} · ${caseTypeLabel[c.caseType].label}`}
              sub={c.groupingBasis}
              side={relativeTime(c.createdAt, now)}
            />
          ))}
        </HomeList>
        <HomeList title="사건 현황 (결제 · 직원 전체)" empty="사건이 없어요.">
          {CASE_GROUP_ORDER.map((g) => (
            <HomeRow key={g} title={CASE_GROUP[g].label} side={`${groups[g]}건`} />
          ))}
        </HomeList>
        <HomeList
          title="의심 세션에서 한 행동"
          more={{ to: '/manager/audit', label: '감사 로그' }}
          empty="의심 세션에서 남은 기록이 없어요."
        >
          {latest(suspicious, (a) => a.occurredAt, 4).map((a) => (
            <HomeRow
              key={a.auditId}
              to="/manager/audit"
              title={`${a.actorName} · ${auditActionText(a.action)}`}
              sub={placeName(a.client?.label)}
              side={relativeTime(a.occurredAt, now)}
            />
          ))}
        </HomeList>
      </div>
    </>
  )
}
