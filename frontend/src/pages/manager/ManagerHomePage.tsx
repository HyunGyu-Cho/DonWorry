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
      description="관리자는 직원 혼자 못 하는 일을 승인하고, 직원 계정이 공격받으면 대응해요. 칸을 누르면 그 화면으로 가요."
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
          tour="home-approvals"
          label="승인 대기"
          value={`${approvals.length}건`}
          note={`직원 혼자 할 수 없는 위험한 변경이에요 (Rule 끄기 · 차단 해제 · AI와 반대 판정). 관리자가 승인해야 반영돼요.${risky > 0 ? ` ${risky}건은 의심 접속에서 왔어요 — 먼저 확인하세요.` : ''}`}
          tone={risky > 0 ? 'bad' : approvals.length > 0 ? 'warn' : 'ok'}
        />
        <HomeTile
          to="/manager/cases"
          tour="home-staff-cases"
          label="의심 사건"
          value={`${openStaff.length}건`}
          note="직원 계정이 공격받은 사건이에요 (비밀번호 대입 · 계정 탈취 의심). 당사자 직원은 볼 수 없고 관리자만 판정해요."
          tone={openStaff.length > 0 ? 'bad' : 'ok'}
        />
        <HomeTile
          to="/manager/audit"
          label="감사 로그"
          value={`확인 필요 ${suspicious.length}건`}
          note="털렸을 수 있는 접속(평소와 다른 기기 · 해외 IP 등)에서 한 행동만 셌어요. 누가 무엇을 바꾸려 했는지 확인하세요."
          tone={suspicious.length > 0 ? 'warn' : 'ok'}
        />
      </div>
      <div className="dw-home-grid">
        <HomeList
          title="승인 대기"
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
          title="의심 사건 (직원 계정)"
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
          title="감사 로그 · 확인 필요"
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
