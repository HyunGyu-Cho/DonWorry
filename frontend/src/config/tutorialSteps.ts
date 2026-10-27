// 튜토리얼 패널(1-12) 시나리오별 단계 — 1-13 E2E가 같은 단계 · 같은 data-tour 이름표를 쓴다
// path = 이 단계 화면 주소 (그 화면에 들어오면 이 단계로 넘어간다), target = 노란 테두리를 붙일 data-tour 이름
// 한 요소에 이름표를 여러 개 달 수 있고(예: "report-tabs report-open"), target도 여러 개를 띄어쓰기로 적을 수 있다

// RERUN = 구매자 화면 · Mailpit 열기 + 구매자 답변 도착(시연) 버튼, WAIT = AI 조사 지켜보기
export type TutorialSpecial = 'RERUN' | 'WAIT'

export type TutorialStep = {
  title: string
  // 지금 할 일 한 문장
  todo: string
  // 이 화면에서 볼 것
  look: string[]
  path: string
  target?: string
  special?: TutorialSpecial
  // 이 일이 일어나면 다음 단계로 (화면이 TUTORIAL_EVENT로 알린다)
  // DECIDED = 판정 확정, APPROVAL_DECIDED = 관리자 승인 · 거절, SESSION_ENDED = 세션 강제 종료, BLOCK_ADDED = 차단 목록 등록
  doneOn?: 'DECIDED' | 'APPROVAL_DECIDED' | 'SESSION_ENDED' | 'BLOCK_ADDED'
}

export const TUTORIAL_STEPS: Record<number, TutorialStep[]> = {
  1: [
    {
      title: '홈에서 할 일 보기',
      todo: '[확인할 결제 경보] 칸을 눌러 보세요.',
      look: ['로그인하면 오늘 처리할 일이 먼저 보여요'],
      path: '/security/home',
      target: 'home-alerts',
    },
    {
      title: '결제 경보 고르기',
      todo: '김민수 고객의 65만 원 "직원 확인" 경보를 눌러 보세요.',
      look: [
        '점수가 애매한(40~69점) 결제는 사람이 확인해요',
        '확실히 위험한 결제는 이미 거절됐어요',
      ],
      path: '/security/alerts',
      target: 'alert-103',
    },
    {
      title: '왜 걸렸는지 보기',
      todo: '적중한 Rule을 읽고 [사건 보기]를 눌러 보세요.',
      look: [
        '처음 쓰는 카드 · 평소(4만 원)의 16배 금액 · 고액 결제가 함께 걸렸어요',
        'Rule 하나만 걸렸다면 어떻게 읽는지도 적혀 있어요',
      ],
      path: '/security/alerts/103',
      target: 'alert-case-link',
    },
    {
      title: '경보가 사건으로 묶였어요',
      todo: '흐름도를 보고 [다음]을 눌러 주세요.',
      look: [
        '같은 고객의 경보를 하나의 사건으로 묶어요',
        'AI 조사 요약에 첫 보고서의 결론이 있어요',
      ],
      path: '/security/cases/201',
      target: 'case-flow',
    },
    {
      title: '구매자에게 본인 확인 메일이 갔어요',
      todo: '구매자 화면을 열어 보고, 아래 [구매자 답변 도착시키기]를 눌러 주세요.',
      look: [
        '구매자 화면에는 이유 · 점수가 나오지 않아요',
        '답이 오면 AI가 새 정보로 다시 조사해요',
      ],
      path: '/security/cases/201',
      target: 'tutorial-actions',
      special: 'RERUN',
    },
    {
      title: 'AI가 다시 조사하는 과정 지켜보기',
      todo: '단계가 하나씩 아래로 그려지는 걸 지켜보세요. 끝나면 알림이 떠요.',
      look: ['어떤 도구로 무엇을 확인했는지 단계마다 보여요', '조사 중에는 판정할 수 없어요'],
      path: '/security/cases/201',
      target: 'case-ai',
      special: 'WAIT',
    },
    {
      title: 'AI 보고서 읽기',
      todo: '[AI 보고서]를 누르고, [AI가 조사한 과정] 탭도 눌러 보세요.',
      look: [
        '결론 → 위험 근거 · 정상 정황 → 경위 순서로 읽어요',
        'AI는 권고만 하고 판정은 사람이 해요',
      ],
      path: '/security/cases/201/report',
      target: 'report-open',
    },
    {
      title: '판정하기',
      todo: '사건 화면으로 돌아가 [승인 취소]를 고르고 사유를 적어 판정을 확정해 보세요.',
      look: ['결제마다 따로 판정해요', 'AI 권고와 반대로 허용하면 재인증 + 관리자 승인이 필요해요'],
      path: '/security/cases/201',
      target: 'case-right',
      doneOn: 'DECIDED',
    },
    {
      title: '조치가 결제에 반영되는지 보기',
      todo: '[조치 센터]에서 승인 취소가 결제에 반영되는 걸 확인해 보세요.',
      look: ['판정 → 결제 담당에 조치 인계 → 결제 상태 반영 순서예요'],
      path: '/security/actions',
      target: 'nav-security-actions',
    },
  ],
  2: [
    {
      title: '홈에서 할 일 보기',
      todo: '[의심 사건] 칸을 눌러 보세요.',
      look: ['직원 계정이 공격받은 사건이에요. 당사자 직원은 볼 수 없고 관리자만 판정해요'],
      path: '/manager/home',
      target: 'home-staff-cases',
    },
    {
      title: '분산 공격 사건 열기',
      todo: '"직원 계정 2개 (박지원 · 이도현)" 사건을 눌러 보세요.',
      look: ['IP 하나당 1~3번만 실패해서 IP 기준으로는 안 보이는 공격이에요'],
      path: '/manager/cases',
      target: 'case-102',
    },
    {
      title: 'AI 조사 실시간으로 보기',
      todo: '단계가 그려지는 걸 지켜보세요. 1차 판단이 실패하고 다시 시도하는 단계가 나와요.',
      look: [
        '구조 검증에 실패하면 최대 3번까지 다시 시도해요',
        'AI가 실패해도 자동으로 판정하지 않아요',
      ],
      path: '/manager/cases/102',
      target: 'case-ai',
      special: 'WAIT',
    },
    {
      title: '흩어진 실패를 계정 기준으로 묶기',
      todo: '흐름도를 보고 [다음]을 눌러 주세요.',
      look: ['IP 30곳의 실패를 같은 계정 · 10분 창으로 묶었어요'],
      path: '/manager/cases/102',
      target: 'case-flow',
    },
    {
      title: 'AI 보고서 읽기',
      todo: '[AI 보고서]를 누르고 [AI가 조사한 과정] 탭에서 실패 → 재시도를 다시 보세요. 다 봤으면 왼쪽 [로그인 모니터링] 메뉴로 가요.',
      look: ['끝난 조사의 과정은 보고서 화면에서 크게 볼 수 있어요'],
      path: '/manager/cases/102/report',
      target: 'report-open',
    },
    {
      title: 'IP가 아니라 계정으로 묶어 보기',
      todo: '[계정별로 묶어 보기]를 눌러 보세요. 흩어진 IP 30개가 계정별로 모여요.',
      look: [
        'IP마다 세면 1~3번씩이라 기존 규칙에 안 걸려요',
        '계정으로 묶으면 10분에 41번 — 직원은 보통 회사 PC 한두 대에서만 로그인해요',
      ],
      path: '/manager/access',
      target: 'access-by-account',
    },
  ],
  3: [
    {
      title: '홈에서 경고 보기',
      todo: '맨 위 "돈워리가 검토 중인 결제" 안내의 [주문 보기]를 눌러 보세요.',
      look: ['검토 중이어도 주문은 그대로 — 사기로 드러나면 손해는 돈워리가 부담해요'],
      path: '/owner/home',
      target: 'home-checking',
    },
    {
      title: '보안 확인 결과',
      todo: '[검토 중] 탭을 보고, 왼쪽 [정산 캘린더]를 눌러 보세요.',
      look: ['사장님 화면에는 점수 · Rule · 구매자 정보가 나오지 않아요'],
      path: '/owner/results',
      target: 'nav-owner-settlements',
    },
    {
      title: '정산 캘린더',
      todo: '주문이 많은 날을 눌러 [모두 보기]로 목록을 열어 보고, 빨간 출금 날도 눌러 보세요. 다 봤으면 [자금 현황]으로 가요.',
      look: [
        '주문이 수십 건이어도 칸에는 합계만 보여요',
        '픽업이 끝나고 3일 뒤에 정산돼요 · 점선은 픽업 전이라 늦어질 수 있어요',
      ],
      path: '/owner/settlements',
      target: 'stl-busy',
    },
    {
      title: '14일 자금 예측',
      todo: '빨간 막대와 "왜 모자라나요?"를 보고 [대출 상품 보기]를 눌러 보세요.',
      look: [
        '검토 중인 결제는 검토가 끝나야 정산 일정에 들어가요',
        '임대료 날 처음 0원 아래로 내려가요',
      ],
      path: '/owner/funds',
      target: 'fund-loans',
    },
    {
      title: '연계 대출 상품',
      todo: '필요한 금액만큼 빌릴 수 있는 상품을 확인해 보세요.',
      look: ['돈워리는 소개만 하고 신청은 각 은행에서 해요'],
      path: '/owner/loans',
      target: 'loan-list',
    },
  ],
  4: [
    {
      title: '홈에서 할 일 보기',
      todo: '[승인 대기] 칸을 눌러 보세요.',
      look: ['의심 세션에서 온 요청이 있으면 먼저 알려 줘요'],
      path: '/manager/home',
      target: 'home-approvals',
    },
    {
      title: '위험 표시가 붙은 요청',
      todo: '"고액 결제" Rule 끄기 요청을 보고 거절해 보세요 (거절 이유 필수).',
      look: [
        '박지원 계정이 탈취가 의심되는 세션에서 보낸 요청이에요',
        '요청한 사람은 스스로 승인할 수 없어요',
      ],
      path: '/manager/approvals',
      target: 'approvals-list',
      doneOn: 'APPROVAL_DECIDED',
    },
    {
      title: '의심 세션 끊기',
      todo: '[로그인 모니터링]의 [세션] 탭에서 "탈취 의심" 세션(독일 Tor)을 [종료]해 보세요.',
      look: [
        '세션 = 로그인한 뒤 받은 접속 열쇠예요. 살아 있으면 비밀번호 없이도 계속 쓸 수 있어요',
        '같은 시간에 회사 PC와 해외 익명 접속에서 함께 쓰이고 있어요',
      ],
      path: '/manager/access',
      // 다른 화면에서 넘어와도 길을 알게 메뉴도 같이
      target: 'session-kill nav-manager-access',
      doneOn: 'SESSION_ENDED',
    },
    {
      title: '계정 탈취 사건',
      todo: '[사건 목록]에서 "보안 직원 박지원 계정" 사건을 열어 보세요.',
      look: ['로그인 → OTP 실패 → 동시 세션 → 위험한 요청 순서로 묶였어요'],
      path: '/manager/cases/101',
      target: 'case-flow',
    },
    {
      title: '감사 로그',
      todo: '[감사 로그]에서 의심 세션이 한 행동을 확인해 보세요.',
      look: ['누가 · 언제 · 어디서 · 무엇을 했는지 고칠 수 없게 남아요'],
      path: '/manager/audit',
      target: 'nav-manager-audit',
    },
  ],
  5: [
    {
      title: '홈에서 시작',
      todo: '왼쪽 [결제 경보] 메뉴를 눌러 보세요.',
      look: ['홈의 [확인할 결제 경보] 칸에 거절된 경보 수도 함께 보여요'],
      path: '/security/home',
      target: 'nav-security-alerts',
    },
    {
      title: '결제 경보 보기',
      todo: '[결제 경보]에서 정하늘 고객의 "거절" 경보를 눌러 보세요.',
      look: ['70점 이상은 사람을 기다리지 않고 바로 거절해요'],
      path: '/security/alerts',
      target: 'alert-106',
    },
    {
      title: '카드 테스팅 흔적',
      todo: '적중한 Rule을 보고 [차단 목록에 등록]을 눌러 값을 골라 보세요.',
      look: [
        '짧은 시간에 여러 카드를 시도했어요',
        '공용 IP는 다른 손님도 막힐 수 있어 값을 골라서 등록해요',
      ],
      path: '/security/alerts/106',
      target: 'alert-block',
      doneOn: 'BLOCK_ADDED',
    },
    {
      title: '차단 목록',
      todo: '[차단 목록]에서 방금 등록한 값과 막은 횟수를 확인해 보세요.',
      look: ['차단 목록과 일치하면 점수 계산 없이 바로 막아요', '해제는 관리자 승인이 필요해요'],
      path: '/security/blocklist',
      target: 'nav-security-blocklist blocklist-table',
    },
  ],
}
