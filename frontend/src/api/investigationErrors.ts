// P3 investigation 화면용 오류 — Mock과 실제 API가 같이 쓴다 (테스트가 불러오므로 mockMode를 쓰지 않는다)

// 2인 승인: 요청한 사람은 자기 요청을 승인 · 거절할 수 없다
export class SelfApprovalError extends Error {
  constructor() {
    super('자신이 요청한 건은 승인할 수 없습니다. 다른 보안 관리자의 확인이 필요합니다.')
    this.name = 'SelfApprovalError'
  }
}

// 직원 사건 조치: 보안 관리자만, 대상 직원 본인은 불가
export class CaseActionForbiddenError extends Error {
  constructor() {
    super('직원 계정 사건은 대상 직원이 아닌 보안 관리자만 판정할 수 있습니다.')
    this.name = 'CaseActionForbiddenError'
  }
}

// 이미 처리된 승인 요청
export class ApprovalClosedError extends Error {
  constructor() {
    super('이미 처리되었거나 만료된 승인 요청입니다.')
    this.name = 'ApprovalClosedError'
  }
}

// 같은 대상에 승인 대기 중인 요청이 이미 있음 (INV_013)
export class ApprovalDuplicateError extends Error {
  constructor() {
    super('같은 대상에 승인을 기다리는 요청이 이미 있습니다.')
    this.name = 'ApprovalDuplicateError'
  }
}
