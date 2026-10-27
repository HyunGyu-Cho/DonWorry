// 구매자 본인 확인 · 사장님 보안 확인 결과 · 메일 발송 기록 화면(1-8)의 말 바꾸기
// React 없이 순수 함수만 (node 테스트가 직접 불러온다). 점수 · 사유는 어디에도 쓰지 않는다
import type {
  NotificationKind,
  NotificationStatus,
  OwnerPaymentResult,
  OwnerSecurityResult,
} from '../types/payment.ts'

export const OWNER_RESULT: Record<
  OwnerSecurityResult,
  { label: string; color: string; note: string }
> = {
  // 판매는 막지 않는다 — 사기로 드러나면 손해는 돈워리가 부담 (S-3 #86)
  CHECKING: { label: '검토 중', color: 'gold', note: '결제 완료 · 돈워리 검토 중' },
  ACCEPTED: { label: '결제 진행', color: 'green', note: '확인 후 매입 완료' },
  REJECTED: { label: '결제 반려', color: 'red', note: '승인 취소 · 청구 안 됨' },
  AUTO_BLOCKED: { label: '자동 차단', color: 'default', note: '결제 전에 중단' },
}

export const OWNER_RESULT_ORDER: OwnerSecurityResult[] = [
  'CHECKING',
  'ACCEPTED',
  'REJECTED',
  'AUTO_BLOCKED',
]

export function ownerCounts(rows: Pick<OwnerPaymentResult, 'result'>[]) {
  const counts: Record<OwnerSecurityResult, number> = {
    CHECKING: 0,
    ACCEPTED: 0,
    REJECTED: 0,
    AUTO_BLOCKED: 0,
  }
  for (const r of rows) counts[r.result] += 1
  return counts
}

export const MAIL_KIND: Record<NotificationKind, { label: string; color: string }> = {
  CHECK: { label: '본인 확인 요청', color: 'gold' },
  PAYMENT: { label: '결제 안내', color: 'blue' },
  FDS: { label: '이상거래 안내', color: 'red' },
  RESULT: { label: '보안 확인 결과', color: 'purple' },
  FUNDS: { label: '자금 안내', color: 'green' },
}

export const MAIL_STATUS: Record<NotificationStatus, { label: string; color: string }> = {
  PENDING: { label: '보내는 중', color: 'processing' },
  SENT: { label: '보냄', color: 'green' },
  FAILED: { label: '실패', color: 'red' },
}

// 남은 시간 → "23시간 뒤 만료돼요" · "1시간 안에 만료돼요"
export function linkExpiresText(expiresAt: string, now: Date): string {
  const hours = Math.floor((Date.parse(expiresAt) - now.getTime()) / 3_600_000)
  return hours >= 1 ? `이 링크는 ${hours}시간 뒤 만료돼요` : '이 링크는 1시간 안에 만료돼요'
}
