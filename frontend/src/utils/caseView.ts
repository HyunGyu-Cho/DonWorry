// 사건 목록 · 상세 화면(1-5)의 계산 — React 없이 순수 함수만 (node 테스트가 직접 불러온다)
import { RULE_GUIDE } from '../config/fdsRules.ts'
import type { CaseDetail, CaseStatus, CaseType } from '../types/case.ts'
import type { RuleCode, StaffAlert } from '../types/fds.ts'
import type { CaseActionType, StaffCase } from '../types/investigation.ts'
import { koreanWon } from './humanize.ts'

export const isStaffCaseType = (t: CaseType) => t !== 'PAYMENT_FRAUD'

// 사건 생성 → AI 조사 → 판정 → 조치 → 종료
export function caseStages(type: CaseType): string[] {
  return [
    '사건 생성',
    'AI 조사',
    isStaffCaseType(type) ? '관리자 판정' : '직원 판정',
    '조치',
    '종료',
  ]
}

// 지금 단계 번호 (0부터). 종료면 단계 수(모두 끝남). AI 조사 중이면 상태와 관계없이 1
export function caseStage(status: CaseStatus, aiRunning: boolean): number {
  if (status === 'CLOSED') return 5
  if (aiRunning || status === 'OPEN' || status === 'INVESTIGATING') return 1
  if (status === 'DECISION_PENDING' || status === 'APPROVAL_PENDING') return 2
  return 3
}

// 상태 띠의 자동 흐름 한 줄
export function autoFlow(type: CaseType): string[] {
  return isStaffCaseType(type)
    ? ['직원 경보', '사건 자동 생성', 'AI 조사 자동 시작', '관리자 판정']
    : ['결제 매입 보류', '사건 자동 생성', 'AI 조사 자동 시작', '직원 판정']
}

export type FlowCard = {
  key: string
  at: string
  // 왼쪽 위 칩 (결제: "직원 확인 · 55점", 직원: Rule 이름)
  badge: string
  title: string
  rules: string[]
  // 이 경보 하나만 봤을 때의 해석 (가장 점수 큰 Rule 기준)
  alone: string
  // 결제 경보 상세 주소 (보안 직원만), 없으면 null
  href: string | null
  staff: boolean
}

const aloneOf = (code: RuleCode | undefined) => (code ? (RULE_GUIDE[code]?.alone ?? '') : '')

// 결제 사건: 묶인 결제마다 경보 카드 한 장 (시간 순)
export function paymentFlowCards(
  detail: Pick<CaseDetail, 'payments'>,
  ruleName: (code: RuleCode) => string,
  linkAlerts: boolean,
): FlowCard[] {
  return detail.payments
    .map((p) => ({
      key: p.casePaymentId,
      at: p.requestedAt ?? p.linkedAt,
      badge: `직원 확인 · ${p.riskScore ?? '?'}점`,
      title: p.amount === null ? '금액 확인 불가' : `${koreanWon(p.amount)} 결제`,
      rules: p.hitRuleCodes.map(ruleName),
      alone: aloneOf(p.hitRuleCodes[0]),
      href: linkAlerts && p.evaluationId !== null ? `/security/alerts/${p.evaluationId}` : null,
      staff: false,
    }))
    .sort((a, b) => a.at.localeCompare(b.at))
}

// 직원 사건: 묶인 직원 경보마다 카드 한 장 (시간 순)
export function staffFlowCards(
  staffCase: Pick<StaffCase, 'staffHitIds'>,
  alerts: StaffAlert[],
  ruleName: (code: RuleCode) => string,
): FlowCard[] {
  return alerts
    .filter((a) => staffCase.staffHitIds.includes(a.staffHitId))
    .map((a) => ({
      key: String(a.staffHitId),
      at: a.detectedAt,
      badge: a.severity === 'HIGH' ? '위험도 높음' : '주의',
      title: ruleName(a.ruleCode),
      rules: [a.summary],
      alone: aloneOf(a.ruleCode),
      href: null,
      staff: true,
    }))
    .sort((a, b) => a.at.localeCompare(b.at))
}

export type StaffVerdict = {
  key: string
  title: string
  // 이 판정을 고르면 요청할 조치 (화면에 쉬운 말로 보여 준다)
  actions: CaseActionType[]
  danger: boolean
}

// 직원 사건 판정 선택지 — 조치 묶음은 프로토타입 v4.2와 같다
export function staffVerdicts(type: CaseType): StaffVerdict[] {
  if (type === 'STAFF_SPRAY') {
    return [
      {
        key: 'ATTACK',
        title: '분산 대입 공격으로 확정',
        actions: ['BLOCK_IPS', 'FORCE_PW', 'WATCH'],
        danger: true,
      },
      { key: 'LEGIT', title: '오탐 (정상 활동)', actions: ['CLEAR_FLAG'], danger: false },
    ]
  }
  return [
    {
      key: 'TAKEOVER',
      title: '직원 계정 탈취로 확정',
      actions: ['KILL_SESSIONS', 'LOCK_STAFF', 'RESET_MFA', 'REJECT_PENDING', 'REVIEW_DECISIONS'],
      danger: true,
    },
    { key: 'LEGIT', title: '본인 활동으로 확인', actions: ['CLEAR_FLAG'], danger: false },
  ]
}

export const ACTION_LABEL: Record<CaseActionType, string> = {
  KILL_SESSIONS: '세션 강제 종료',
  LOCK_STAFF: '계정 잠금',
  RESET_MFA: '비밀번호 · OTP 재등록',
  BLOCK_IPS: '공격 IP 일괄 차단',
  FORCE_PW: '비밀번호 변경 요구',
  WATCH: '24시간 집중 감시',
  REJECT_PENDING: '이 계정의 승인 대기 요청 거절',
  REVIEW_DECISIONS: '이 계정의 최근 판정 재검토',
  CLEAR_FLAG: '경고 해제',
}
