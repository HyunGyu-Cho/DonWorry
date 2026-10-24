// Mock 응답을 실제 네트워크처럼 조금 늦게 돌려준다 (로딩 표시를 확인할 수 있게)
// 화면이 Mock 원본을 직접 바꾸지 못하도록 복사본을 돌려준다
export function mockRespond<T>(data: T, delayMs = 300): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(structuredClone(data)), delayMs)
  })
}
