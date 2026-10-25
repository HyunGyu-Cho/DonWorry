// P4 보고서 Mock — 결론 카드 3유형 (프로토타입 v3.1 문구, 비슷한 사건 · 조사 과정은 v4.2)
// 직원 사건 보고서는 api/mock/investigation.ts 사건 101 · 102 · 91, api/mock/fds.ts 직원 경보와 같은 장면
// 결제 사기 보고서(사건 201)는 v3.1 시나리오 ① — 결제 사건 Mock은 1-5에서 맞춘다
// 사건 102(방금 생긴 분산 공격)는 처음 볼 때 조사가 시작돼 단계가 실시간으로 나온다
// 테스트가 직접 불러오므로 import.meta.env를 읽는 mockMode는 쓰지 않는다
import { StaffReportForbiddenError } from '../reportErrors.ts'
import { getMockActor } from './investigation.ts'
import { buildRun, finish, llm, llmFailed, req, tool, totalMs } from './reportSteps.ts'
import type { StepDef } from './reportSteps.ts'
import { mockEpoch, mockRespond } from './respond.ts'
import type { ConclusionReport, ReportRun, SimilarCase } from '../../types/report.ts'

const MODEL = 'gpt-4.1-mini · OpenAI API (예시)'

const minutesAgo = (now: Date, minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString()

const DAY = 24 * 60

// 사건별 최신 보고서 버전 · 조사 단계 · 끝난 시각(분 전)
const RUNS: Record<string, { version: number; doneAgo: number; defs: StepDef[] }> = {
  '101': {
    version: 3,
    doneAgo: 29,
    defs: [
      req('직원 경보 4건 · 보고서 v3 (경보가 묶일 때마다 다시 조사)'),
      tool(
        'get_security_events',
        1500,
        '직원 경보 4건 · 박지원 계정',
        '로그인 기록 9건 · 사내망 밖 4건 · 같은 세션 동시 사용 1건',
      ),
      tool('find_similar_cases', 1000, '같은 직원 계정 · 같은 Rule 조합', '1건 (정상 1)'),
      llm('위험 근거 4 · 정상 정황 2 · 권고 4'),
      ...finish(3),
    ],
  },
  '102': {
    version: 1,
    doneAgo: 1,
    defs: [
      req('직원 경보 2건 · 보고서 v1'),
      tool(
        'get_security_events',
        1500,
        '직원 경보 2건 · 박지원 · 이도현 계정',
        '로그인 실패 41회 · 해외 IP 30개 · 성공 0회',
      ),
      tool('find_similar_cases', 1000, '같은 공격 IP 묶음 · 같은 Rule 조합', '0건'),
      llmFailed(1, '구조 검증 실패: 필수 항목 "확인할 것" 누락 → 다시 시도 (최대 3회)'),
      llm('위험 근거 3 · 정상 정황 2 · 권고 3', 'AI 판단 (2차)'),
      ...finish(1),
    ],
  },
  '201': {
    version: 1,
    doneAgo: 20,
    defs: [
      req('결제 1건 · 보고서 v1'),
      tool('get_case_payments', 900, '이 사건에 묶인 결제', '결제 1건 · 합계 65만 원'),
      tool('get_fds_evidence', 1100, '결제 1건', 'Rule 3개 적중 · 55점'),
      tool('get_payment_history', 1200, '김민수 고객 · 최근 90일', '과거 결제 5건 · 평균 4만 원'),
      tool(
        'get_payment_authentication',
        800,
        '단체 행사용 케이크 세트 결제',
        '처음 쓰는 카드 · 카드사 승인',
      ),
      tool(
        'get_order_context',
        800,
        '단체 행사용 케이크 세트 주문',
        '픽업 예정 · 구매자 응답 없음',
      ),
      tool('find_similar_cases', 1000, '같은 고객 · 같은 Rule 조합', '2건 (사기 1 · 정상 1)'),
      llm('위험 근거 3 · 정상 정황 2 · 권고 2'),
      ...finish(1),
    ],
  },
  '91': {
    version: 1,
    doneAgo: 24 * DAY,
    defs: [
      req('직원 경보 1건 · 보고서 v1'),
      tool(
        'get_security_events',
        1500,
        '직원 경보 1건 · 박지원 계정',
        '집 인터넷 로그인 1건 · OTP 성공',
      ),
      tool('find_similar_cases', 1000, '같은 직원 계정 · 같은 Rule 조합', '0건'),
      llm('위험 근거 1 · 정상 정황 2 · 권고 1'),
      ...finish(1),
    ],
  },
  '180': {
    version: 1,
    doneAgo: 40 * DAY,
    defs: [
      req('결제 1건 · 보고서 v1'),
      tool('get_case_payments', 900, '이 사건에 묶인 결제', '결제 1건 · 합계 48만 원'),
      tool('get_fds_evidence', 1100, '결제 1건', 'Rule 2개 적중 · 60점'),
      tool('find_similar_cases', 1000, '같은 고객 · 같은 Rule 조합', '0건'),
      llm('위험 근거 2 · 정상 정황 1 · 권고 2'),
      ...finish(1),
    ],
  },
  '175': {
    version: 1,
    doneAgo: 55 * DAY,
    defs: [
      req('결제 1건 · 보고서 v1'),
      tool('get_case_payments', 900, '이 사건에 묶인 결제', '결제 1건 · 합계 52만 원'),
      tool('get_fds_evidence', 1100, '결제 1건', 'Rule 2개 적중 · 45점'),
      tool('find_similar_cases', 1000, '같은 Rule 조합', '0건'),
      llm('위험 근거 2 · 정상 정황 2 · 권고 1'),
      ...finish(1),
    ],
  },
}

// 모든 단계가 끝난 조사 기록 (보고서 trace와 같다)
function finishedRun(caseId: string, now: Date): ReportRun {
  const run = RUNS[caseId]
  const startedAt = new Date(now.getTime() - run.doneAgo * 60_000 - totalMs(run.defs))
  return buildRun(caseId, run.version, run.defs, startedAt)
}

const SIMILAR: Record<string, (now: Date) => SimilarCase[]> = {
  '101': (now) => [
    {
      caseId: '91',
      caseType: 'STAFF_TAKEOVER',
      title: '박지원 · 집에서 로그인',
      occurredAt: minutesAgo(now, 24 * DAY),
      outcome: 'NORMAL',
      outcomeLabel: '재택근무로 확인 · 경고 해제',
      matches: ['SAME_STAFF'],
      strength: 'STRONG',
    },
  ],
  '201': (now) => [
    {
      caseId: '180',
      caseType: 'PAYMENT_FRAUD',
      title: '김민수 · 새 카드로 고액 결제',
      occurredAt: minutesAgo(now, 40 * DAY),
      outcome: 'FRAUD',
      outcomeLabel: '카드 도용 확인 · 승인 취소',
      matches: ['SAME_CUSTOMER', 'RULE_COMBO'],
      strength: 'STRONG',
    },
    {
      caseId: '175',
      caseType: 'PAYMENT_FRAUD',
      title: '다른 고객 · 처음 쓰는 카드로 고액 결제',
      occurredAt: minutesAgo(now, 55 * DAY),
      outcome: 'NORMAL',
      outcomeLabel: '본인 확인 후 정상 · 매입 허용',
      matches: ['RULE_COMBO'],
      strength: 'WEAK',
    },
  ],
}

export function buildMockReports(now: Date): ConclusionReport[] {
  const at = (minutes: number) => minutesAgo(now, minutes)
  return [
    {
      schemaVersion: 2,
      reportType: 'STAFF_TAKEOVER',
      caseId: '101',
      reportVersion: 3,
      generatedAt: at(29),
      riskScore: 82,
      verdict: '박지원 계정이 탈취되어 공격자가 탐지 설정을 끄려 한 것으로 보입니다',
      summary:
        '해외 Tor IP에서 박지원 비밀번호는 맞혔지만 OTP를 3회 틀렸고, 이후 같은 세션이 사내 PC와 해외 IP에서 동시에 쓰였습니다. 그 세션에서 "고액 결제" Rule 끄기가 요청되어 관리자 승인 대기에서 멈췄습니다.',
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
          detail: '관리자 승인 대기에서 멈춰 있어 탐지 설정은 그대로',
          source: '관리자 승인함',
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
        { at: at(30), text: '"고액 결제" Rule 끄기 요청 → 관리자 승인 대기', kind: 'WARNING' },
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
      similarCases: SIMILAR['101']?.(now) ?? [],
      trace: finishedRun('101', now).steps,
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
      similarCases: SIMILAR['102']?.(now) ?? [],
      trace: finishedRun('102', now).steps,
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
        { label: '승인 취소 검토 · 단체 행사용 케이크 세트', kind: 'NEGATIVE' },
        { label: '구매자 본인 확인 연락', kind: 'INFO' },
      ],
      riskPoints: [
        {
          title: '고액 결제 (+20점)',
          detail: '단체 행사용 케이크 세트 · 65만 원',
          source: 'FDS 평가',
        },
        {
          title: '평소보다 큰 금액 (+20점)',
          detail: '평균 4만 원 고객의 65만 원 결제',
          source: 'FDS 평가',
        },
        {
          title: '처음 쓰는 카드 (+15점)',
          detail: '끝자리 1173 카드 · 이 고객의 결제 완료 이력 없음',
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
        { at: at(60 * 24 * 12), text: '정상 결제 3만 2천 원 (끝자리 4821 카드)', kind: 'NORMAL' },
        {
          at: at(25),
          text: '단체 행사용 케이크 세트 65만 원 (끝자리 1173 카드) → FDS 55점 직원 확인 → 매입 보류',
          kind: 'WARNING',
        },
        { at: at(24), text: '사건 자동 생성 · AI 조사 요청', kind: 'KEY' },
      ],
      paymentRecommendations: [
        {
          paymentId: '31',
          label: '단체 행사용 케이크 세트',
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
      similarCases: SIMILAR['201']?.(now) ?? [],
      trace: finishedRun('201', now).steps,
      limitations: [
        '구매자 응답은 메일을 받은 사람의 응답이라, 계정 탈취 시 공격자가 답할 수도 있습니다.',
        'AI 권고는 최종 결정이 아니며, AI 권고와 반대로 매입을 허용하면 재인증과 관리자 승인이 필요합니다.',
      ],
      model: MODEL,
    },
    ...buildPastReports(now),
  ]
}

// 비슷한 과거 사건에서 눌러 들어가는 최종 보고서 (이미 판정이 끝난 사건)
function pastReport(
  now: Date,
  caseId: string,
  reportType: ConclusionReport['reportType'],
  riskScore: number,
  verdict: string,
  summary: string,
  extra: Pick<
    ConclusionReport,
    'recommendations' | 'riskPoints' | 'normalPoints' | 'paymentRecommendations'
  >,
): ConclusionReport {
  const run = finishedRun(caseId, now)
  return {
    schemaVersion: 2,
    reportType,
    caseId,
    reportVersion: RUNS[caseId].version,
    generatedAt: run.finishedAt ?? run.startedAt,
    riskScore,
    verdict,
    summary,
    ...extra,
    unknowns: [],
    checks: [],
    timeline: [],
    evidence: [],
    similarCases: [],
    trace: run.steps,
    limitations: ['이미 판정이 끝난 사건의 최종 보고서입니다.'],
    model: MODEL,
  }
}

function buildPastReports(now: Date): ConclusionReport[] {
  return [
    pastReport(
      now,
      '91',
      'STAFF_TAKEOVER',
      35,
      '재택근무 중 집에서 로그인한 것으로 보입니다',
      '박지원 계정이 집 인터넷에서 로그인했지만 OTP를 한 번에 통과했고, 같은 날 재택근무 신청이 있었습니다.',
      {
        recommendations: [{ label: '경고 해제', kind: 'POSITIVE' }],
        riskPoints: [
          {
            title: '평소와 다른 접속 환경',
            detail: '사내망 밖 집 인터넷에서 로그인',
            source: '직원 로그인 기록',
          },
        ],
        normalPoints: [
          {
            title: 'OTP 한 번에 통과',
            detail: '실패 없이 2단계 인증 성공',
            source: '직원 로그인 기록',
          },
          { title: '재택근무 신청 있음', detail: '같은 날 재택근무 일정', source: '관리자 확인' },
        ],
        paymentRecommendations: null,
      },
    ),
    pastReport(
      now,
      '180',
      'PAYMENT_FRAUD',
      74,
      '카드 도용으로 보여 승인 취소를 권고합니다',
      '김민수 고객 계정에서 처음 쓰는 카드로 평소보다 큰 48만 원을 결제했고, 구매자가 결제하지 않았다고 답했습니다.',
      {
        recommendations: [{ label: '승인 취소 검토', kind: 'NEGATIVE' }],
        riskPoints: [
          { title: '처음 쓰는 카드', detail: '이 고객이 처음 쓴 카드', source: 'FDS 평가' },
          {
            title: '구매자 부인',
            detail: '"본인이 결제하지 않았어요" 응답',
            source: '구매자 확인',
          },
        ],
        normalPoints: [
          { title: '평소 쓰던 기기', detail: '이 고객이 쓰던 휴대폰에서 결제', source: '결제' },
        ],
        paymentRecommendations: [
          {
            paymentId: '18',
            label: '생일 케이크 세트',
            amount: 480000,
            recommendation: 'REJECT_REVIEW',
            reason: '구매자가 결제하지 않았다고 응답',
          },
        ],
      },
    ),
    pastReport(
      now,
      '175',
      'PAYMENT_FRAUD',
      45,
      '처음 쓰는 카드지만 본인 결제로 확인됐습니다',
      '처음 쓰는 카드로 52만 원을 결제했지만 구매자가 본인 결제라고 답했고, 평소 쓰던 기기와 배송지였습니다.',
      {
        recommendations: [{ label: '매입 허용 검토', kind: 'POSITIVE' }],
        riskPoints: [
          { title: '처음 쓰는 카드', detail: '이 고객이 처음 쓴 카드', source: 'FDS 평가' },
          { title: '고액 결제', detail: '52만 원', source: 'FDS 평가' },
        ],
        normalPoints: [
          { title: '구매자 본인 확인', detail: '"제가 결제했어요" 응답', source: '구매자 확인' },
          {
            title: '평소 쓰던 기기 · 배송지',
            detail: '이전 주문과 같은 기기 · 배송지',
            source: '결제',
          },
        ],
        paymentRecommendations: [
          {
            paymentId: '17',
            label: '돌잔치 케이크',
            amount: 520000,
            recommendation: 'ACCEPT_REVIEW',
            reason: '구매자 본인 결제 확인',
          },
        ],
      },
    ),
  ]
}

// 사건 102 조사는 처음 볼 때 시작한다 (시연에서 처음부터 따라가 보게)
const LIVE_CASE = '102'
let liveStartedAt: Date | null = null
// 시나리오 ①: 구매자가 "결제하지 않았어요"라고 답하면 사건 201을 v2로 다시 조사한다
const RERUN_CASE = '201'
let rerunStartedAt: Date | null = null

export function resetMockReportRun() {
  liveStartedAt = null
  rerunStartedAt = null
}

const RERUN_DEFS: StepDef[] = [
  req('구매자 응답 1건 · 보고서 v2 (새 정보가 들어와 다시 조사)'),
  tool(
    'get_order_context',
    900,
    '단체 행사용 케이크 세트 주문',
    '픽업 예정 · 구매자 응답 "결제하지 않았어요"',
  ),
  tool('get_case_payments', 900, '이 사건에 묶인 결제', '결제 1건 · 합계 65만 원'),
  tool('get_fds_evidence', 1100, '결제 1건', 'Rule 3개 적중 · 55점'),
  tool('get_payment_history', 1200, '김민수 고객 · 최근 90일', '과거 결제 5건 · 평균 4만 원'),
  tool('find_similar_cases', 1000, '같은 고객 · 같은 Rule 조합', '2건 (사기 1 · 정상 1)'),
  llm('위험 근거 4 · 정상 정황 1 · 권고 2'),
  ...finish(2),
]

// 시연 버튼 — 구매자 답변이 도착한 것처럼 다시 조사를 시작한다 (한 번만)
export async function mockStartBuyerRerun(): Promise<void> {
  rerunStartedAt ??= new Date()
  return mockRespond(undefined)
}

function rerunReport(found: ConclusionReport, run: ReportRun, answeredAt: Date): ConclusionReport {
  return {
    ...found,
    reportVersion: 2,
    generatedAt: run.finishedAt ?? found.generatedAt,
    riskScore: 88,
    verdict: '구매자가 결제하지 않았다고 답해 카드 도용 가능성이 높습니다',
    summary:
      '김민수 고객 계정에서 처음 쓰는 카드로 평소(4만 원)보다 큰 65만 원을 결제했고, 구매자가 본인 확인 메일에 "결제하지 않았어요"라고 답했습니다. 다만 계정이 탈취됐다면 공격자도 메일을 받을 수 있어 약한 근거로 봅니다.',
    recommendations: [
      { label: '승인 취소 검토 · 단체 행사용 케이크 세트', kind: 'NEGATIVE' },
      { label: '사기로 확정되면 카드 · 기기 차단 목록 등록', kind: 'INFO' },
    ],
    // 구매자 응답이 들어왔으니 "아직 없음"은 빼고, 답한 사람이 정말 구매자인지를 남긴다
    unknowns: [
      '답한 사람이 실제 구매자인지 (계정이 털리면 공격자도 메일을 받음)',
      '새 카드를 쓴 이유 (재발급 · 가족 카드 등)',
    ],
    timeline: [
      ...found.timeline,
      {
        at: answeredAt.toISOString(),
        text: '구매자 본인 확인 응답 "결제하지 않았어요" → AI 다시 조사 (v2)',
        kind: 'KEY',
      },
    ],
    paymentRecommendations: (found.paymentRecommendations ?? []).map((r) => ({
      ...r,
      reason: '처음 쓰는 카드로 평소의 16배 금액, 구매자가 결제하지 않았다고 답함',
    })),
    riskPoints: [
      {
        title: '구매자가 결제하지 않았다고 답함',
        detail: '본인 확인 메일 응답 · 계정이 털리면 공격자도 받을 수 있어 단독 근거로 쓰지 않음',
        source: '구매자 본인 확인 응답',
      },
      ...found.riskPoints,
    ],
    trace: run.steps,
  }
}

export function buildLiveRun(now: Date, startedAt: Date): ReportRun {
  const run = RUNS[LIVE_CASE]
  return buildRun(LIVE_CASE, run.version, run.defs, startedAt, now)
}

// 직원 계정 사건 보고서 · 조사 과정은 보안 관리자만 (대상 직원이 어떤 증거가 잡혔는지 알 수 없게)
function checkCanRead(report: ConclusionReport | undefined) {
  if (
    report &&
    report.reportType !== 'PAYMENT_FRAUD' &&
    getMockActor().role !== 'SECURITY_MANAGER'
  ) {
    throw new StaffReportForbiddenError()
  }
}

export async function mockGetCaseReport(caseId: string): Promise<ConclusionReport | null> {
  const now = new Date()
  const found = buildMockReports(mockEpoch()).find((r) => r.caseId === caseId)
  checkCanRead(found)
  // 다시 조사 중이면 지난 보고서(v1), 끝나면 새 보고서(v2)
  if (found && caseId === RERUN_CASE && rerunStartedAt) {
    const run = buildRun(RERUN_CASE, 2, RERUN_DEFS, rerunStartedAt, now)
    return mockRespond(run.status === 'SUCCEEDED' ? rerunReport(found, run, rerunStartedAt) : found)
  }
  if (!found || caseId !== LIVE_CASE) return mockRespond(found ?? null)
  // 조사가 끝나야 보고서가 생긴다
  liveStartedAt ??= now
  const run = buildLiveRun(now, liveStartedAt)
  if (run.status !== 'SUCCEEDED') return mockRespond(null)
  return mockRespond({
    ...found,
    generatedAt: run.finishedAt ?? found.generatedAt,
    trace: run.steps,
  })
}

export async function mockGetReportRun(caseId: string): Promise<ReportRun | null> {
  const now = new Date()
  checkCanRead(buildMockReports(mockEpoch()).find((r) => r.caseId === caseId))
  if (!RUNS[caseId]) return mockRespond(null)
  if (caseId === RERUN_CASE && rerunStartedAt) {
    return mockRespond(buildRun(RERUN_CASE, 2, RERUN_DEFS, rerunStartedAt, now))
  }
  if (caseId !== LIVE_CASE) return mockRespond(finishedRun(caseId, mockEpoch()))
  liveStartedAt ??= now
  return mockRespond(buildLiveRun(now, liveStartedAt))
}
