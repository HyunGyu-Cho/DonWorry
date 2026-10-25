// P5 돈워리 결제창 타입 — CakeShop 연동 계약(docs/payment/cakeshop-contract.md 4절)
// 구매자가 보는 화면이라 점수 · 사유 · 내부 상태 이름은 넣지 않는다

export type CheckoutSessionStatus = 'OPEN' | 'PAID' | 'EXPIRED'

export type CheckoutSession = {
  merchantName: string
  orderTitle: string
  amount: number
  buyerName: string
  // 가린 이메일 (m***@example.com)
  buyerEmailMasked: string
  expiresAt: string
  status: CheckoutSessionStatus
}

// 시연용 모의 카드 — 카드 번호는 받지 않고 토큰만 쓴다
export type DemoCard = {
  cardToken: string
  label: string
  // 화면 표시용 가린 번호 (**** 1173)
  masked: string
  // 발급국 ISO 코드
  country: string
}

// PAID = 결제 완료(CAPTURED), CHECKING = 결제 확인 중(HELD · PENDING), BLOCKED = 결제 불가(DENIED), DECLINED = 카드사 거절
export type CheckoutOutcome = 'PAID' | 'CHECKING' | 'BLOCKED' | 'DECLINED'

export type CheckoutResult = {
  paymentId: string
  outcome: CheckoutOutcome
  title: string
  // 구매자 안내 문장 (청구 여부 · 다음에 할 일)
  message: string
  // CakeShop 결과 페이지 (화면 이동용, 결과의 근거 아님)
  returnUrl: string
}

// 시연용 테스트 상점 (demo 프로필 전용, CakeShop 없이 결제 흐름 확인)
export type TestProduct = {
  productId: string
  title: string
  amount: number
  // 상품 카드의 짧은 설명 (예: 고액 주문)
  note: string
}

export type TestOrder = {
  // 이 토큰으로 결제창 /checkout/{토큰}을 연다
  sessionToken: string
}
