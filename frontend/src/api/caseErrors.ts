// P3 결제 사건 화면용 오류 — Mock과 실제 API가 같이 쓴다 (테스트가 불러오므로 mockMode를 쓰지 않는다)

// 판정 저장 시 화면이 본 증거 버전·보고서가 현재와 다를 때 (INV_003 · INV_004, 설계 3.5)
export class CaseVersionConflictError extends Error {
  constructor() {
    super('사건에 새 정보가 들어와 증거 버전이 바뀌었습니다. 다시 확인한 뒤 판정해 주세요.')
    this.name = 'CaseVersionConflictError'
  }
}
