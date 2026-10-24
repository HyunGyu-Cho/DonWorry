// FDS 점수 구간과 Rule 쉬운 설명 — 화면이 숫자에 뜻을 붙일 때 쓴다 (PLAN 1-0 원칙)
// 판정의 정본은 백엔드다. 이 값은 화면 안내용이며 seed_fds_rules와 같게 유지한다
import type { RuleCode } from '../types/fds.ts'

// api/fds.ts FdsResult 중 점수로 정해지는 값 (ERROR는 평가 실패)
export type ScoreResult = 'ALLOW' | 'REVIEW' | 'DENY'

// 점수 합이 min 이상이면 그 구간 (높은 구간부터 검사)
export const SCORE_BANDS: { result: ScoreResult; min: number; label: string; meaning: string }[] = [
  { result: 'DENY', min: 70, label: '거절', meaning: '70점 이상이면 결제를 바로 거절해요' },
  {
    result: 'REVIEW',
    min: 40,
    label: '직원 확인',
    meaning: '40점 이상이면 카드 승인 후 매입을 멈추고 직원이 확인해요',
  },
  { result: 'ALLOW', min: 0, label: '통과', meaning: '40점 미만이면 그대로 결제돼요' },
]

// 차단 목록과 일치하면 점수와 관계없이 거절
export function resultForScore(score: number, blocklisted = false): ScoreResult {
  if (blocklisted) return 'DENY'
  return (SCORE_BANDS.find((band) => score >= band.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1])
    .result
}

export type RuleGuide = {
  group: string
  effect: string
  example: string
  // 이 Rule 하나만 걸렸을 때의 해석 — 오탐 가능성을 함께 보여 준다
  alone: string
}

// 프로토타입 v3.1 문구
export const RULE_GUIDE: Record<RuleCode, RuleGuide> = {
  BLOCKLIST: {
    group: '차단 목록',
    effect: '점수 계산 없이 즉시 거절',
    example: '사기 판정된 기기에서 새 카드로 재시도',
    alone: '단독으로도 차단 — 재범 방지',
  },
  HIGH_AMOUNT: {
    group: '금액',
    effect: '+20점 / +35점',
    example: '65만 원 단체 케이크 세트',
    alone: '단독으론 정상 — 단체 행사 주문일 수도',
  },
  AMOUNT_SPIKE: {
    group: '금액',
    effect: '+20점',
    example: '평균 4만 원 고객이 65만 원 결제',
    alone: '단독으론 정상 — 특별한 날일 수도',
  },
  NEW_CARD: {
    group: '신규성',
    effect: '+15점',
    example: '평소 카드 A 고객이 카드 B로 결제',
    alone: '단독으론 정상 — 카드를 새로 발급받았을 수도',
  },
  NEW_ACCOUNT: {
    group: '신규성',
    effect: '+20점',
    example: '가입 40분 만에 결제',
    alone: '단독으론 정상 — 첫 주문 고객일 수도',
  },
  CARD_TESTING: {
    group: '빈도',
    effect: '+45점',
    example: '한 IP에서 카드 3장을 번갈아 시도',
    alone: '단독으론 주의 — 가족 카드를 바꿔 썼을 수도',
  },
  DECLINE_RETRY: {
    group: '빈도',
    effect: '+30점',
    example: '거절 2번 뒤 금액을 낮춰 재시도',
    alone: '단독으론 정상 — 한도 초과를 몰랐을 수도',
  },
  GEO_MISMATCH: {
    group: '불일치',
    effect: '+25점',
    example: '한국 카드인데 네덜란드 Tor IP에서 결제',
    alone: '단독으론 정상 — 해외 출장 중일 수도',
  },
  STAFF_LOGIN_FAIL: {
    group: '인증',
    effect: '경보 · 비밀번호 성공 후 OTP 실패면 "비밀번호 유출 의심"',
    example: '해외 IP에서 비밀번호 성공, OTP 3회 실패',
    alone: '단독으론 주의 — 코드를 잘못 입력했을 수도',
  },
  STAFF_NEW_DEVICE: {
    group: '접속 환경',
    effect: '경보 · 위험도 주의',
    example: '집 IP에서 로그인',
    alone: '단독으론 정상 — 재택근무일 수도',
  },
  CONCURRENT_SESSION: {
    group: '세션',
    effect: '경보 · 위험도 높음 (세션 탈취 의심)',
    example: '사내 PC 세션이 해외 IP에서도 사용',
    alone: '단독으론 주의 — 네트워크가 바뀌었을 수도',
  },
  DECISION_ANOMALY: {
    group: '행동',
    effect: '경보 · 위험도 높음',
    example: '취소 권고 결제 3건을 연달아 허용 시도',
    alone: '단독으론 주의 — 고객 확인을 마친 뒤였을 수도',
  },
  CONFIG_WEAKEN: {
    group: '행동',
    effect: '경보 · 2인 승인 대기에 위험 표시',
    example: '"고액 결제" Rule 끄기 요청',
    alone: '단독으론 정상 — 오탐을 줄이려는 튜닝일 수도',
  },
  STAFF_DISTRIBUTED: {
    group: '분산 공격',
    effect: '경보 · 위험도 높음 (IP별 규칙을 피하는 공격)',
    example: '해외 IP 30개에서 1~2번씩, 총 40회 실패',
    alone: '단독으론 주의 — 회사 VPN 출구가 여러 개일 수도',
  },
  PASSWORD_SPRAY: {
    group: '분산 공격',
    effect: '경보 · 위험도 높음',
    example: '같은 IP가 박지원 · 이도현 계정에 차례로 시도',
    alone: '단독으론 주의 — 공용 PC일 수도',
  },
}
