// P4 보고서 화면용 오류 — Mock과 실제 API가 같이 쓴다 (테스트가 불러오므로 mockMode를 쓰지 않는다)

// 직원 계정 사건 보고서는 보안 관리자만 본다 (대상 직원이 어떤 증거가 잡혔는지 알 수 없게)
export class StaffReportForbiddenError extends Error {
  constructor() {
    super('직원 계정 사건 보고서는 보안 관리자만 볼 수 있습니다.')
    this.name = 'StaffReportForbiddenError'
  }
}
