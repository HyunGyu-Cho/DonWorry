// P5 결제 · 메일 · 본인 확인 타입 (payments 연동 필드 · notifications · buyer_confirmations)
// 메일함은 만들지 않는다 — 시연에서 메일은 Mailpit(개발용 가짜 메일 서버) 화면에서 연다
import type { PaymentStatus } from './case.ts'

// 결제 + CakeShop이 넘긴 구매자 연동 필드 (보안 직원 · 관리자만). 값이 없으면 null
export type PaymentContext = {
  paymentId: string
  orderRef: string
  // payments에 컬럼이 없어 지금은 null (0-8에서 결제 요청 필드로 추가)
  orderTitle: string | null
  amount: number
  status: PaymentStatus
  requestedAt: string
  customerRef: string
  buyerEmail: string | null
  clientIp: string | null
  deviceId: string | null
  cardLast4: string | null
  // ISO 국가 코드 (KR · US 등)
  cardCountry: string | null
  // CakeShop 가입 시각
  customerJoinedAt: string | null
}

// notifications 값 (V20261024_102015 주석과 같다)
export type RecipientType = 'BUYER' | 'OWNER'
// FDS = 이상거래 안내, RESULT = 보안 확인 결과, FUNDS = 자금, PAYMENT = 결제 안내, CHECK = 본인 확인 요청
export type NotificationKind = 'FDS' | 'RESULT' | 'FUNDS' | 'PAYMENT' | 'CHECK'
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED'

// 메일 발송 기록 1건 (본문은 저장하지 않는다)
export type Notification = {
  notificationId: string
  // 결제와 무관한 메일(자금 안내)이면 null
  paymentId: string | null
  recipientType: RecipientType
  recipientEmail: string
  kind: NotificationKind
  subject: string
  status: NotificationStatus
  createdAt: string
  sentAt: string | null
  failureReason: string | null
}

export type NotificationQuery = {
  recipientType?: RecipientType
  paymentId?: string
}

// buyer_confirmations.answer (V20261024_102016 주석과 같다)
export type BuyerAnswer = 'MINE' | 'NOT_MINE'

// 공개 확인 페이지가 보여 줄 것. 보안 확인 사유 · 점수는 넣지 않는다
export type BuyerConfirmRequest = {
  merchantName: string
  orderTitle: string | null
  amount: number
  paidAt: string
  expiresAt: string
  // 이미 응답했으면 그 답 (다시 응답할 수 없음)
  answered: BuyerAnswer | null
}

export type BuyerConfirmation = {
  confirmationId: string
  paymentId: string
  answer: BuyerAnswer
  respondedAt: string
}

// 사장님 보안 확인 결과 — 내부 점수 · Rule · AI 원문 · 구매자 개인정보는 넣지 않는다
// CHECKING = 보안 확인 중(매입 보류), ACCEPTED = 결제 진행, REJECTED = 결제 반려(승인 취소), AUTO_BLOCKED = 자동 차단
export type OwnerSecurityResult = 'CHECKING' | 'ACCEPTED' | 'REJECTED' | 'AUTO_BLOCKED'

export type OwnerPaymentResult = {
  paymentId: string
  orderRef: string
  orderTitle: string | null
  amount: number
  result: OwnerSecurityResult
  // 실제 결제 상태 (매입 보류 · 매입 완료 · 승인 취소 · 결제 거절)
  paymentStatus: PaymentStatus
  processedAt: string
  // 사장님 화면 "안내" 문장
  guide: string
}
