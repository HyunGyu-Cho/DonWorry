// Mock 응답을 실제 네트워크처럼 조금 늦게 돌려준다 (로딩 표시를 확인할 수 있게)
// 화면이 Mock 원본을 직접 바꾸지 못하도록 복사본을 돌려준다
export function mockRespond<T>(data: T, delayMs = 300): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(structuredClone(data)), delayMs)
  })
}

// 시연 데이터의 기준 시각 — 화면을 연 순간에 한 번 정한다. 모든 Mock이 이 시각 기준으로 "몇 분 전"을 만들어
// 시간이 지나도 결제 → 경보 → 사건 순서가 뒤집히지 않는다 (새로 고침하면 다시 정해진다)
const MOCK_EPOCH = new Date()
export const mockEpoch = () => MOCK_EPOCH
