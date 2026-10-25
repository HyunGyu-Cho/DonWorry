// 관리자 승인함 · 감사 로그 · 조치 센터 화면(1-6)의 말 바꾸기 — React 없이 순수 함수만 (node 테스트가 직접 불러온다)
import type { HandoffRow } from '../types/case.ts'
import type { ApprovalRequestType, AuditLog } from '../types/investigation.ts'

export const APPROVAL_TYPE: Record<
  ApprovalRequestType,
  { label: string; color: string; note: string }
> = {
  DECISION_OVERRIDE: {
    label: '권고 반대 판정',
    color: 'gold',
    note: 'AI가 승인 취소를 권고한 결제를 매입 허용',
  },
  RULE_DISABLE: { label: 'Rule 완화', color: 'magenta', note: 'Rule 끄기 — 승인하면 바로 꺼짐' },
  RULE_THRESHOLD: { label: 'Rule 완화', color: 'magenta', note: 'Rule 기준값 완화' },
  BLOCKLIST_RELEASE: {
    label: '차단 해제',
    color: 'purple',
    note: '차단 목록에서 빼기 — 승인하면 이 값의 결제를 다시 점수로만 판단',
  },
}

// 감사 로그 action 코드 → 우리말. 모르는 코드는 그대로
const ACTION_TEXT: Record<string, string> = {
  LOGIN_SUCCESS: '로그인',
  LOGIN_OTP_FAILED: 'OTP 인증 실패',
  SESSION_CONCURRENT: '세션 동시 사용 감지',
  SESSION_TERMINATED: '세션 강제 종료',
  STAFF_UNLOCKED: '계정 잠금 해제',
  APPROVAL_REQUESTED: '관리자 승인 요청',
  APPROVAL_APPROVED: '관리자 승인 · 승인',
  APPROVAL_REJECTED: '관리자 승인 · 거절',
  CASE_CREATED: '사건 자동 생성',
  CASE_ACTIONS_REQUESTED: '직원 사건 판정 · 조치 요청',
  DECISION_CONFIRMED: '결제 사건 판정',
  RULE_ENABLED: 'Rule 다시 켜기',
  BLOCKLIST_ADDED: '차단 목록 등록',
}
export const auditActionText = (action: string) => ACTION_TEXT[action] ?? action

const TARGET_TEXT: Record<string, string> = {
  APPROVAL_REQUEST: '승인 요청',
  SECURITY_CASE: '사건',
  FDS_RULE: 'Rule',
  BLOCKLIST_ENTRY: '차단 목록 값',
}
// 대상 이름 (번호는 원본 보기에서). 대상이 없으면 null
export function auditTargetText(log: Pick<AuditLog, 'targetType' | 'targetId'>): string | null {
  if (!log.targetType) return null
  return TARGET_TEXT[log.targetType] ?? log.targetType
}

// 상세 값 중 사람이 읽을 것만 한 줄로 (사유 · 메모 · 시도 횟수 · 새 기기)
export function auditDetailText(detail: AuditLog['detail']): string | null {
  if (!detail) return null
  const parts: string[] = []
  if (typeof detail.reason === 'string' && detail.reason) parts.push(`사유: ${detail.reason}`)
  if (typeof detail.comment === 'string' && detail.comment) parts.push(`메모: ${detail.comment}`)
  if (typeof detail.attempts === 'number') parts.push(`${detail.attempts}회 시도`)
  if (detail.newDevice === true) parts.push('처음 보는 기기')
  return parts.length ? parts.join(' · ') : null
}

// 조치 진행: 0 요청 → 1 접수 → 2 완료(결제 상태가 매입 완료 · 승인 취소로 바뀜). 실패면 -1
export function handoffStage(
  row: Pick<HandoffRow, 'status' | 'actionType' | 'paymentStatus'>,
): number {
  if (row.status === 'FAILED') return -1
  if (row.status === 'REQUESTED') return 0
  const done = row.actionType === 'CAPTURE' ? 'CAPTURED' : 'VOIDED'
  return row.paymentStatus === done ? 2 : 1
}

// 남은 시간 → "23시간 뒤 만료" · "곧 만료" · "만료됨"
export function expiresText(expiresAt: string, now: Date): string {
  const left = Date.parse(expiresAt) - now.getTime()
  if (left <= 0) return '만료됨'
  const hours = Math.floor(left / 3_600_000)
  return hours >= 1 ? `${hours}시간 뒤 만료` : '곧 만료'
}
