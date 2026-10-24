// P5 결제 화면용 오류 — Mock과 실제 API가 같이 쓴다 (테스트가 불러오므로 mockMode를 쓰지 않는다)

// 본인 확인 링크가 없거나 만료됨
export class ConfirmLinkExpiredError extends Error {
  constructor() {
    super('확인 링크가 만료되었거나 올바르지 않습니다. CakeShop 고객센터로 문의해 주세요.')
    this.name = 'ConfirmLinkExpiredError'
  }
}

// 이미 응답한 링크 (한 번만 응답할 수 있다)
export class ConfirmAlreadyAnsweredError extends Error {
  constructor() {
    super('이미 응답하셨습니다. 응답은 한 번만 할 수 있습니다.')
    this.name = 'ConfirmAlreadyAnsweredError'
  }
}
