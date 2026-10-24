// P4 보고서 Mock — 결론 카드 3유형 (프로토타입 v3.1 문구)
// 직원 사건 보고서는 api/mock/investigation.ts 사건 101 · 102, api/mock/fds.ts 직원 경보와 같은 장면
// 결제 사기 보고서(사건 201)는 v3.1 시나리오 ① — 결제 사건 Mock은 1-5에서 맞춘다
// 테스트가 직접 불러오므로 import.meta.env를 읽는 mockMode는 쓰지 않는다
import { StaffReportForbiddenError } from '../reportErrors.ts'
import { getMockActor } from './investigation.ts'
import { mockRespond } from './respond.ts'
import type { ConclusionReport } from '../../types/report.ts'

const MODEL = 'gpt-4.1-mini · OpenAI API (예시)'

const minutesAgo = (now: Date, minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString()

export function buildMockReports(now: Date): ConclusionReport[] {
  const at = (minutes: number) => minutesAgo(now, minutes)
  return [
    {
      schemaVersion: 2,
      reportType: 'STAFF_TAKEOVER',
      caseId: '101',
      reportVersion: 1,
      generatedAt: at(90),
      riskScore: 82,
      verdict: '박지원 계정이 탈취되어 공격자가 탐지 설정을 끄려 한 것으로 보입니다',
      summary:
        '해외 Tor IP에서 박지원 비밀번호는 맞혔지만 OTP를 3회 틀렸고, 이후 같은 세션이 사내 PC와 해외 IP에서 동시에 쓰였습니다. 그 세션에서 "고액 결제" Rule 끄기가 요청되어 2인 승인 대기에서 멈췄습니다.',
      recommendations: [
        { label: '박지원 세션 강제 종료', kind: 'NEGATIVE' },
        { label: '박지원 계정 잠금', kind: 'NEGATIVE' },
        { label: '대기 중인 Rule 끄기 요청 거절', kind: 'NEGATIVE' },
        { label: '의심 시점 이후 판정 재검토', kind: 'INFO' },
      ],
      riskPoints: [
        {
          title: '로그인 · OTP 실패 반복',
          detail: '비밀번호 성공 후 OTP 3회 실패 → 비밀번호 유출 의심',
          source: '직원 경보 #2',
        },
        {
          title: '세션 동시 사용',
          detail: '사내 PC 세션이 해외 Tor IP에서도 사용됨',
          source: '직원 경보 #3',
        },
        {
          title: '탐지 설정 완화 시도',
          detail: '탈취 의심 세션에서 "고액 결제" Rule 끄기 요청',
          source: '직원 경보 #4',
        },
        {
          title: '평소와 다른 접속 환경',
          detail: '지난 7일 모두 사내 10.20.0.15 업무 PC에서 접속 → 이번엔 해외 Tor 출구 IP',
          source: '직원 로그인 기록',
        },
      ],
      normalPoints: [
        {
          title: '2단계 인증이 새 로그인을 막음',
          detail: '해외 IP의 새 로그인은 OTP에서 실패해 들어오지 못함',
          source: '직원 로그인 기록',
        },
        {
          title: 'Rule 끄기는 아직 적용되지 않음',
          detail: '2인 승인 대기에서 멈춰 있어 탐지 설정은 그대로',
          source: '2인 승인함',
        },
      ],
      unknowns: [
        '세션 토큰이 어떻게 유출됐는지 (업무 PC 악성코드 · 피싱 등)',
        '같은 시간대에 다른 직원도 노렸는지',
      ],
      checks: [
        '박지원 업무 PC 악성코드 점검',
        '의심 시점 이후 박지원 이름으로 남은 판정 · 요청 재검토',
        'Tor · 해외 IP의 관리자 화면 접속 차단 정책 검토',
      ],
      timeline: [
        { at: at(780), text: '박지원 · 집 IP에서 로그인 (새 기기)', kind: 'NORMAL' },
        { at: at(93), text: '해외 Tor IP · 비밀번호 성공 후 OTP 3회 실패', kind: 'WARNING' },
        { at: at(93), text: '사건 101 생성 · AI 조사 요청', kind: 'KEY' },
        { at: at(40), text: '같은 세션이 사내 PC와 해외 IP에서 동시에 사용', kind: 'WARNING' },
        { at: at(30), text: '"고액 결제" Rule 끄기 요청 → 2인 승인 대기', kind: 'WARNING' },
      ],
      paymentRecommendations: null,
      evidence: [
        {
          evidenceId: 'EV-01',
          source: '직원 경보 · 직원 룰 2',
          description: '집 IP에서 로그인 (새 기기)',
          retrievedAt: at(90),
          ref: { type: 'STAFF_ALERT', id: 1 },
        },
        {
          evidenceId: 'EV-02',
          source: '직원 경보 · 직원 룰 1',
          description: '비밀번호 성공 후 OTP 3회 실패',
          retrievedAt: at(90),
          ref: { type: 'STAFF_ALERT', id: 2 },
        },
        {
          evidenceId: 'EV-03',
          source: '직원 경보 · 직원 룰 3',
          description: '세션 동시 사용',
          retrievedAt: at(90),
          ref: { type: 'STAFF_ALERT', id: 3 },
        },
        {
          evidenceId: 'EV-04',
          source: '직원 경보 · 직원 룰 5',
          description: '"고액 결제" Rule 끄기 요청',
          retrievedAt: at(90),
          ref: { type: 'STAFF_ALERT', id: 4 },
        },
      ],
      limitations: [
        'IP 위치 · 기기 지문은 단순화했습니다 (시연용).',
        '직원 계정 사건은 본인이 아닌 보안 관리자만 판정합니다.',
      ],
      model: MODEL,
    },
    {
      schemaVersion: 2,
      reportType: 'STAFF_SPRAY',
      caseId: '102',
      reportVersion: 1,
      generatedAt: at(1),
      riskScore: 88,
      verdict: '여러 IP로 나눠 직원 계정들의 비밀번호를 대입하는 공격입니다 (아직 뚫리지 않음)',
      summary:
        '해외 IP 30개가 10분 동안 박지원 계정에 1~2번씩, 총 40회 비밀번호를 틀렸습니다. 같은 IP가 이도현 계정도 시도했습니다. IP 하나씩 보면 기준에 못 미치지만, 계정 기준으로 묶으면 자동화 도구로 비밀번호 목록을 대입하는 전형적인 공격입니다.',
      recommendations: [
        { label: '공격 IP 30개 일괄 차단', kind: 'NEGATIVE' },
        { label: '박지원 · 이도현 비밀번호 변경', kind: 'NEGATIVE' },
        { label: '24시간 집중 감시', kind: 'INFO' },
      ],
      riskPoints: [
        {
          title: '분산 로그인 실패',
          detail: '박지원 계정 · 해외 IP 30개에서 10분 안 실패 40회',
          source: '직원 경보 #5',
        },
        {
          title: '비밀번호 뿌리기',
          detail: '같은 IP가 박지원 · 이도현 계정에 차례로 시도',
          source: '직원 경보 #6',
        },
        {
          title: '모두 처음 보는 해외 IP',
          detail:
            '대역 5곳(45.83.64.x, 91.240.118.x, 103.152.220.x, 185.191.171.x, 194.26.192.x) · 지난 7일 접속 이력 없음',
          source: '직원 로그인 기록',
        },
      ],
      normalPoints: [
        {
          title: '로그인 성공 0건',
          detail: '비밀번호를 맞힌 시도가 없어 OTP 단계까지 간 적도 없음',
          source: '직원 로그인 기록',
        },
        {
          title: '두 직원 모두 사내에서 정상 근무 중',
          detail: '박지원 10.20.0.15 · 이도현 10.20.0.31',
          source: '세션 기록',
        },
      ],
      unknowns: [
        '공격자가 쓰는 비밀번호 목록이 어디서 나왔는지 (다른 사이트 유출 등)',
        '다른 직원 계정도 노릴지',
      ],
      checks: [
        '공격 IP 대역 차단 후 실패 횟수가 줄어드는지 확인',
        '직원 비밀번호가 유출 목록에 있는지 점검',
        '로그인 화면에 일정 횟수 이상 실패 시 지연(throttling) 적용 검토',
      ],
      timeline: [
        { at: at(9), text: '첫 실패 · 해외 IP에서 박지원 계정 로그인 실패', kind: 'WARNING' },
        { at: at(1), text: 'IP 30개 · 40회 실패 (IP당 1~2회)', kind: 'WARNING' },
        { at: at(1), text: '사건 102 생성 · AI 조사 요청', kind: 'KEY' },
      ],
      paymentRecommendations: null,
      evidence: [
        {
          evidenceId: 'EV-01',
          source: '직원 경보 · 직원 룰 6',
          description: '분산 로그인 실패',
          retrievedAt: at(1),
          ref: { type: 'STAFF_ALERT', id: 5 },
        },
        {
          evidenceId: 'EV-02',
          source: '직원 경보 · 직원 룰 7',
          description: '비밀번호 뿌리기',
          retrievedAt: at(1),
          ref: { type: 'STAFF_ALERT', id: 6 },
        },
        {
          evidenceId: 'EV-03',
          source: '직원 로그인 기록',
          description: '해외 IP 실패 40회 · 성공 0회',
          retrievedAt: at(1),
          ref: null,
        },
      ],
      limitations: [
        'IP 위치는 시연용 가짜 주소 목록으로 판정했습니다.',
        '직원 계정 사건은 대상 직원이 아닌 보안 관리자가 판정합니다.',
      ],
      model: MODEL,
    },
    {
      schemaVersion: 2,
      reportType: 'PAYMENT_FRAUD',
      caseId: '201',
      reportVersion: 1,
      generatedAt: at(20),
      riskScore: 78,
      verdict: '카드 도용 가능성이 있어 본인 확인이 필요합니다',
      summary:
        '김민수 고객 계정에서 처음 쓰는 카드로 평소(4만 원)보다 큰 65만 원을 결제했습니다. 구매자 본인 확인 응답은 아직 없습니다.',
      recommendations: [
        { label: '승인 취소 검토 · 결제 #31', kind: 'NEGATIVE' },
        { label: '구매자 본인 확인 연락', kind: 'INFO' },
      ],
      riskPoints: [
        { title: '고액 결제 (+20점)', detail: '결제 #31 · 65만 원', source: 'FDS 평가' },
        {
          title: '평소보다 큰 금액 (+20점)',
          detail: '평균 4만 원 고객의 65만 원 결제',
          source: 'FDS 평가',
        },
        {
          title: '처음 쓰는 카드 (+15점)',
          detail: '**** 1173 · 이 고객의 결제 완료 이력 없음',
          source: 'FDS 평가',
        },
      ],
      normalPoints: [
        {
          title: '같은 계정 정상 결제 5건',
          detail: '평균 4만 원 · 계정 이력 자체는 오래됨',
          source: '결제 이력',
        },
        {
          title: '단체 주문 가능성',
          detail: '단체 행사용 케이크 세트 (10개) · 금액이 큰 것이 자연스러울 수 있음',
          source: '주문 정보 · CakeShop',
        },
      ],
      unknowns: ['구매자 본인 확인 응답 (아직 없음)', '새 카드를 쓴 이유 (재발급 · 가족 카드 등)'],
      checks: [
        'CakeShop에 픽업 예정자 정보 문의',
        '같은 기기 · IP의 다른 계정 결제 확인',
        '확정 후 사기면 카드 · 기기를 차단 목록에 등록',
      ],
      timeline: [
        { at: at(60 * 24 * 12), text: '정상 결제 3만 2천 원 (**** 4821)', kind: 'NORMAL' },
        {
          at: at(25),
          text: '결제 #31 · 65만 원 (**** 1173) → FDS 55점 REVIEW → 매입 보류',
          kind: 'WARNING',
        },
        { at: at(24), text: '사건 201 생성 · AI 조사 요청', kind: 'KEY' },
      ],
      paymentRecommendations: [
        {
          paymentId: '31',
          label: '결제 #31 · 단체 행사용 케이크 세트',
          amount: 650000,
          recommendation: 'REJECT_REVIEW',
          reason: '처음 쓰는 카드로 평소의 16배 금액, 본인 확인 전',
        },
      ],
      evidence: [
        {
          evidenceId: 'EV-01',
          source: '결제',
          description: '결제 #31 65만 원 · **** 1173 · 121.134.55.10 · DEV-1A42',
          retrievedAt: at(20),
          ref: { type: 'PAYMENT', id: 31 },
        },
        {
          evidenceId: 'EV-02',
          source: 'FDS 평가',
          description: '55점 · 고액 결제, 평소보다 큰 금액, 처음 쓰는 카드',
          retrievedAt: at(20),
          ref: { type: 'FDS_EVALUATION', id: 31 },
        },
      ],
      limitations: [
        '구매자 응답은 메일을 받은 사람의 응답이라, 계정 탈취 시 공격자가 답할 수도 있습니다.',
        'AI 권고는 최종 결정이 아니며, AI 권고와 반대로 매입을 허용하면 재인증과 2인 승인이 필요합니다.',
      ],
      model: MODEL,
    },
  ]
}

export async function mockGetCaseReport(caseId: string): Promise<ConclusionReport | null> {
  await mockRespond(null)
  const found = buildMockReports(new Date()).find((r) => r.caseId === caseId) ?? null
  // 직원 계정 사건 보고서는 보안 관리자만
  if (found && found.reportType !== 'PAYMENT_FRAUD' && getMockActor().role !== 'SECURITY_MANAGER') {
    throw new StaffReportForbiddenError()
  }
  return found
}
