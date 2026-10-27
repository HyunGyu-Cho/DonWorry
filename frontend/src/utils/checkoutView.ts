// 결제창 · 테스트 상점 화면(1-9)의 말 바꾸기 — React 없이 순수 함수만 (node 테스트가 직접 불러온다)
// 구매자 화면이라 점수 · 사유 · 내부 상태 이름은 쓰지 않는다
import type { CheckoutOutcome } from '../types/checkout.ts'

type ResultStatus = 'success' | 'info' | 'warning' | 'error'

// 결과 종류 → 결과 그림 · 청구 여부 한 줄
export const OUTCOME_VIEW: Record<CheckoutOutcome, { status: ResultStatus; charge: string }> = {
  PAID: { status: 'success', charge: '카드에 청구됐어요' },
  BLOCKED: { status: 'warning', charge: '카드에 청구되지 않았어요' },
  DECLINED: { status: 'error', charge: '카드에 청구되지 않았어요' },
}

// 테스트 상점 안내용 — 카드마다 어떤 결과가 나오는지 (Mock 시연 규칙, 실제는 FDS가 정한다)
export const CARD_GUIDE: { label: string; result: string }[] = [
  { label: '자주 쓰는 카드', result: '결제 완료' },
  { label: '처음 쓰는 카드', result: '결제 완료 (고액이면 돈워리가 뒤에서 확인 · 본인 확인 메일)' },
  { label: '해외 발급 카드', result: '고액이면 결제 진행 불가' },
  { label: '한도 초과 카드', result: '카드사 거절' },
]

// 남은 시간 → "이 결제창은 14분 뒤 닫혀요"
export function checkoutExpiresText(expiresAt: string, now: Date): string {
  const minutes = Math.floor((Date.parse(expiresAt) - now.getTime()) / 60_000)
  return minutes >= 1 ? `이 결제창은 ${minutes}분 뒤 닫혀요` : '이 결제창은 곧 닫혀요'
}

// 돌아갈 주소 — 우리 화면(/로 시작)이면 앱 안에서 이동, 아니면 상점 사이트로 나간다
export function returnTarget(returnUrl: string): { internal: boolean; to: string } {
  return { internal: returnUrl.startsWith('/'), to: returnUrl }
}

// 국내 · 해외 발급 표시
export const cardCountryText = (country: string) => (country === 'KR' ? '국내 발급' : '해외 발급')
