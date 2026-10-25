// P2 fds 화면용 오류 — Mock과 실제 API가 같이 쓴다 (테스트가 불러오므로 mockMode를 쓰지 않는다)

// Rule 켜기는 보안 직원 · 보안 관리자만 (FDS_010)
export class RuleActionForbiddenError extends Error {
  constructor() {
    super('Rule을 바꿀 권한이 없습니다. 보안 직원 계정으로 다시 시도해 주세요.')
    this.name = 'RuleActionForbiddenError'
  }
}

// 이미 켜져 있는 Rule (FDS_011)
export class RuleAlreadyEnabledError extends Error {
  constructor() {
    super('이미 켜져 있는 Rule입니다. 화면을 새로 고쳐 주세요.')
    this.name = 'RuleAlreadyEnabledError'
  }
}
