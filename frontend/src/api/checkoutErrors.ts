// P5 결제창 오류 — Mock과 실제 API가 같이 쓴다 (테스트가 불러오므로 mockMode를 쓰지 않는다)

// PAY_022: 결제창 만료 · 없음
export class CheckoutExpiredError extends Error {
  constructor() {
    super('결제 시간이 지났습니다. CakeShop에서 다시 주문해 주세요.')
    this.name = 'CheckoutExpiredError'
  }
}

// PAY_023: 이미 결제한 결제창 (같은 결제창으로 두 번 결제하지 않게)
export class CheckoutAlreadyPaidError extends Error {
  constructor() {
    super('이미 결제가 진행된 주문입니다. CakeShop 주문 내역에서 확인해 주세요.')
    this.name = 'CheckoutAlreadyPaidError'
  }
}
