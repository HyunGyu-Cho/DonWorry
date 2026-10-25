// 시연 시나리오 5개 — 랜딩(1-11) · 튜토리얼 패널(1-12) · E2E(1-13)가 같은 목록을 쓴다
// 아이디는 Mock 시연 계정. 비밀번호는 여기 두지 않는다

export type Scenario = {
  id: number
  // 화면 번호 표시 (①~⑤)
  mark: string
  title: string
  // 누구로 시작하는지
  roleLabel: string
  loginId: string
  summary: string
  // 보게 되는 장면 (2~4개)
  sees: string[]
  minutes: number
}

export const SCENARIOS: Scenario[] = [
  {
    id: 1,
    mark: '①',
    title: '결제 사기 의심',
    roleLabel: '보안 직원',
    loginId: 'jiwon',
    summary: '처음 쓰는 카드로 평소의 5배인 65만 원 결제가 들어와요.',
    sees: ['결제 경보', '경보 → 사건 묶기', 'AI 조사 보고서', '판정 → 조치'],
    minutes: 5,
  },
  {
    id: 2,
    mark: '②',
    title: '직원 계정 분산 공격',
    roleLabel: '보안 관리자',
    loginId: 'yunseo',
    summary: 'IP 30곳에서 1~2번씩 로그인을 시도해 직원 계정을 노려요.',
    sees: ['직원 접속 감시', '계정 기준으로 묶은 사건', 'AI 조사 실패 → 재시도', '계정 조치'],
    minutes: 5,
  },
  {
    id: 3,
    mark: '③',
    title: '정산 자금 부족',
    roleLabel: '사장님',
    loginId: 'boss',
    summary: '보안 확인 중인 주문 때문에 정산이 늦어져 임대료 날 잔액이 모자라요.',
    sees: ['보안 확인 결과', '정산 캘린더', '14일 자금 예측', '연계 대출 상품'],
    minutes: 3,
  },
  {
    id: 4,
    mark: '④',
    title: '직원 계정 탈취',
    roleLabel: '보안 관리자',
    loginId: 'yunseo',
    summary: '낯선 기기에서 직원 계정으로 로그인한 뒤 차단 해제를 요청해요.',
    sees: ['의심 세션', '관리자 승인함의 위험 표시', '세션 종료 · 계정 잠금', '감사 로그'],
    minutes: 4,
  },
  {
    id: 5,
    mark: '⑤',
    title: '카드 테스팅 → 자동 차단',
    roleLabel: '보안 직원',
    loginId: 'jiwon',
    summary: '짧은 시간에 여러 카드로 결제를 시도해 쓸 수 있는 카드를 찾아요.',
    sees: ['자동 거절된 경보', '차단 목록 등록', '같은 기기의 재시도 차단'],
    minutes: 3,
  },
]

export const scenarioById = (id: number) => SCENARIOS.find((s) => s.id === id) ?? null
