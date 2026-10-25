// P5 결제 · 메일 발송 기록 · 본인 확인 Mock — 시나리오 ① 장면 (프로토타입 v4.2)
// 결제 31은 api/mock/report.ts 사건 201, 결제 18 · 17은 비슷한 과거 사건 180 · 175와 같은 결제
// 메일 본문은 Mailpit에서 보므로 여기에는 발송 기록만 둔다
// 테스트가 직접 불러오므로 import.meta.env를 읽는 mockMode는 쓰지 않는다
import { ConfirmAlreadyAnsweredError, ConfirmLinkExpiredError } from '../paymentErrors.ts'
import { mockRespond } from './respond.ts'
import type {
  BuyerAnswer,
  BuyerConfirmation,
  BuyerConfirmRequest,
  Notification,
  NotificationQuery,
  OwnerPaymentResult,
  OwnerSecurityResult,
  PaymentContext,
} from '../../types/payment.ts'

const MERCHANT_NAME = 'CakeShop'
const DAY = 24 * 60

const minutesAgo = (now: Date, minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString()

export function buildMockPayments(now: Date): PaymentContext[] {
  const at = (minutes: number) => minutesAgo(now, minutes)
  return [
    {
      paymentId: '31',
      orderRef: 'CS-20261024-0120',
      orderTitle: '단체 행사용 케이크 세트',
      amount: 650000,
      status: 'HELD',
      requestedAt: at(25),
      customerRef: 'C-0142',
      buyerEmail: 'minsu.kim@example.com',
      clientIp: '121.134.55.10',
      ip: {
        address: '121.134.55.10',
        countryCode: 'KR',
        ipType: 'DOMESTIC',
        label: '국내 가정용 인터넷 (서울)',
      },
      deviceId: 'DEV-1A42',
      deviceLabel: 'Windows PC · Chrome',
      cardLast4: '1173',
      cardCountry: 'KR',
      customerJoinedAt: at(420 * DAY),
    },
    {
      paymentId: '32',
      orderRef: 'CS-20261024-0121',
      orderTitle: '프리미엄 웨딩 케이크',
      amount: 890000,
      status: 'DENIED',
      requestedAt: at(15),
      customerRef: 'C-0510',
      buyerEmail: 'yuna.choi@example.com',
      clientIp: '45.83.64.12',
      ip: {
        address: '45.83.64.12',
        countryCode: 'NL',
        ipType: 'ANONYMOUS',
        label: '해외 VPN 접속 (네덜란드)',
      },
      deviceId: 'DEV-9Z01',
      deviceLabel: 'Android 폰 · CakeShop 앱',
      cardLast4: '4402',
      cardCountry: 'US',
      customerJoinedAt: at(2 * DAY),
    },
    {
      paymentId: '33',
      orderRef: 'CS-20261024-0122',
      orderTitle: '딸기 생크림 케이크',
      amount: 38000,
      status: 'CAPTURED',
      requestedAt: at(8),
      customerRef: 'C-0388',
      buyerEmail: 'seoyeon.lee@example.com',
      clientIp: '59.10.88.3',
      ip: {
        address: '59.10.88.3',
        countryCode: 'KR',
        ipType: 'DOMESTIC',
        label: '국내 모바일 통신망',
      },
      deviceId: 'DEV-2B07',
      deviceLabel: '아이폰 · Safari',
      cardLast4: '5521',
      cardCountry: 'KR',
      customerJoinedAt: at(210 * DAY),
    },
    {
      paymentId: '34',
      orderRef: 'CS-20261024-0123',
      orderTitle: '조각 케이크',
      amount: 12000,
      status: 'DENIED',
      requestedAt: at(3),
      customerRef: 'C-0601',
      buyerEmail: 'zk81p@tempmail.example',
      clientIp: '185.220.101.7',
      ip: {
        address: '185.220.101.7',
        countryCode: 'NL',
        ipType: 'ANONYMOUS',
        label: '해외 Tor 익명 접속 (네덜란드)',
      },
      deviceId: 'DEV-7E30',
      deviceLabel: 'Linux PC · 자동화 브라우저',
      cardLast4: '7781',
      cardCountry: 'US',
      customerJoinedAt: at(43),
    },
    {
      paymentId: '35',
      orderRef: 'CS-20261024-0118',
      orderTitle: '초코 케이크',
      amount: 54000,
      status: 'CAPTURED',
      requestedAt: at(50),
      customerRef: 'C-0220',
      buyerEmail: 'jihoon.oh@example.com',
      clientIp: '211.36.140.22',
      ip: {
        address: '211.36.140.22',
        countryCode: 'KR',
        ipType: 'DOMESTIC',
        label: '국내 모바일 통신망',
      },
      deviceId: 'DEV-3C55',
      deviceLabel: 'Android 폰 · Chrome',
      cardLast4: '6604',
      cardCountry: 'KR',
      customerJoinedAt: at(95 * DAY),
    },
    {
      paymentId: '36',
      orderRef: 'CS-20261024-0109',
      orderTitle: '치즈 케이크',
      amount: 42000,
      // FDS 평가 실패 — 직원이 직접 확인할 때까지 결제 대기
      status: 'PENDING',
      requestedAt: at(130),
      customerRef: 'C-0388',
      buyerEmail: 'seoyeon.lee@example.com',
      clientIp: '59.10.88.3',
      ip: {
        address: '59.10.88.3',
        countryCode: 'KR',
        ipType: 'DOMESTIC',
        label: '국내 모바일 통신망',
      },
      deviceId: 'DEV-2B07',
      deviceLabel: '아이폰 · Safari',
      cardLast4: '5521',
      cardCountry: 'KR',
      customerJoinedAt: at(210 * DAY),
    },
    {
      paymentId: '18',
      orderRef: 'CS-20260914-0031',
      orderTitle: '생일 케이크 세트',
      amount: 480000,
      status: 'VOIDED',
      requestedAt: at(40 * DAY),
      customerRef: 'C-0142',
      buyerEmail: 'minsu.kim@example.com',
      clientIp: '121.134.55.10',
      ip: {
        address: '121.134.55.10',
        countryCode: 'KR',
        ipType: 'DOMESTIC',
        label: '국내 가정용 인터넷 (서울)',
      },
      deviceId: 'DEV-1A42',
      deviceLabel: 'Windows PC · Chrome',
      cardLast4: '8830',
      cardCountry: 'KR',
      customerJoinedAt: at(420 * DAY),
    },
    {
      paymentId: '17',
      orderRef: 'CS-20260830-0012',
      orderTitle: '돌잔치 케이크',
      amount: 520000,
      status: 'CAPTURED',
      requestedAt: at(55 * DAY),
      customerRef: 'C-0066',
      buyerEmail: 'doyun.han@example.com',
      clientIp: '118.235.9.41',
      ip: {
        address: '118.235.9.41',
        countryCode: 'KR',
        ipType: 'DOMESTIC',
        label: '국내 가정용 인터넷 (부산)',
      },
      deviceId: 'DEV-6F21',
      deviceLabel: '아이패드 · Safari',
      cardLast4: '2290',
      cardCountry: 'KR',
      customerJoinedAt: at(150 * DAY),
    },
  ]
}

export function buildMockNotifications(now: Date): Notification[] {
  const at = (minutes: number) => minutesAgo(now, minutes)
  let seq = 0
  const mail = (
    paymentId: string | null,
    recipientType: Notification['recipientType'],
    recipientEmail: string,
    kind: Notification['kind'],
    subject: string,
    minutes: number,
    failureReason: string | null = null,
  ): Notification => ({
    notificationId: String(++seq),
    paymentId,
    recipientType,
    recipientEmail,
    kind,
    subject,
    status: failureReason ? 'FAILED' : 'SENT',
    createdAt: at(minutes),
    sentAt: failureReason ? null : at(minutes),
    failureReason,
  })
  const owner = 'owner@cakeshop.kr'
  return [
    mail(
      '33',
      'BUYER',
      'seoyeon.lee@example.com',
      'PAYMENT',
      '[CakeShop] 결제가 완료되었습니다 · 딸기 생크림 케이크',
      8,
    ),
    mail(
      '32',
      'BUYER',
      'yuna.choi@example.com',
      'PAYMENT',
      '[CakeShop] 결제를 진행할 수 없습니다 · 프리미엄 웨딩 케이크',
      15,
    ),
    mail(
      '32',
      'OWNER',
      owner,
      'FDS',
      '[돈워리] 고위험 결제를 자동 차단했습니다 · 프리미엄 웨딩 케이크',
      15,
    ),
    mail(
      '31',
      'BUYER',
      'minsu.kim@example.com',
      'CHECK',
      '[CakeShop] 결제를 확인하고 있습니다 · 단체 행사용 케이크 세트',
      24,
    ),
    mail(
      '31',
      'OWNER',
      owner,
      'FDS',
      '[돈워리] 보안 확인 중인 결제가 있습니다 · 단체 행사용 케이크 세트',
      24,
    ),
    mail(
      null,
      'OWNER',
      owner,
      'FUNDS',
      '[돈워리] 다음 주 자금 부족이 예상됩니다',
      3 * DAY,
      '메일 서버 연결 실패 (재시도 예정)',
    ),
    mail(
      '18',
      'OWNER',
      owner,
      'RESULT',
      '[돈워리] 보안 확인이 끝났습니다 · 생일 케이크 세트',
      40 * DAY - 90,
    ),
    mail(
      '17',
      'OWNER',
      owner,
      'RESULT',
      '[돈워리] 보안 확인이 끝났습니다 · 돌잔치 케이크',
      55 * DAY - 120,
    ),
  ]
}

// 사장님 화면 — 보안 확인을 거친 결제만 (정상 결제 33은 없음)
export function buildMockOwnerResults(now: Date): OwnerPaymentResult[] {
  const byId = new Map(buildMockPayments(now).map((p) => [p.paymentId, p]))
  const row = (
    paymentId: string,
    result: OwnerSecurityResult,
    minutes: number,
    guide: string,
  ): OwnerPaymentResult => {
    const p = byId.get(paymentId)!
    return {
      paymentId,
      orderRef: p.orderRef,
      orderTitle: p.orderTitle,
      amount: p.amount,
      result,
      paymentStatus: p.status,
      processedAt: minutesAgo(now, minutes),
      guide,
    }
  }
  return [
    row(
      '32',
      'AUTO_BLOCKED',
      15,
      '결제 전에 중단되어 구매자에게 청구되지 않았습니다. 주문을 진행하지 마세요.',
    ),
    row(
      '31',
      'CHECKING',
      24,
      '카드 승인은 완료되었고, 확인이 끝나면 결과를 메일로 알려 드립니다. 아직 케이크를 만들지 마세요.',
    ),
    row(
      '18',
      'REJECTED',
      40 * DAY - 90,
      '본인 결제로 확인되지 않아 승인을 취소했습니다. 구매자에게 청구되지 않습니다.',
    ),
    row('17', 'ACCEPTED', 55 * DAY - 120, '확인이 끝나 결제가 완료되었습니다. 주문을 진행하세요.'),
  ]
}

// 메일 속 1회용 링크 토큰 (실제로는 DB에 해시만 저장, 2-23)
type ConfirmLink = { paymentId: string; expiresInMinutes: number }
export const MOCK_CONFIRM_TOKENS: Record<string, ConfirmLink> = {
  'demo-check-31': { paymentId: '31', expiresInMinutes: 24 * 60 - 24 },
  'demo-expired': { paymentId: '18', expiresInMinutes: -40 * DAY },
}

const answers = new Map<string, BuyerConfirmation>()

export function resetMockPayment() {
  answers.clear()
}

function findLink(token: string, now: Date) {
  const link = MOCK_CONFIRM_TOKENS[token]
  if (!link || link.expiresInMinutes <= 0) throw new ConfirmLinkExpiredError()
  const payment = buildMockPayments(now).find((p) => p.paymentId === link.paymentId)!
  return { link, payment }
}

export function mockGetPaymentContext(paymentId: string): Promise<PaymentContext | null> {
  return mockRespond(buildMockPayments(new Date()).find((p) => p.paymentId === paymentId) ?? null)
}

export function mockGetNotifications(query: NotificationQuery = {}): Promise<Notification[]> {
  const rows = buildMockNotifications(new Date()).filter(
    (n) =>
      (!query.recipientType || n.recipientType === query.recipientType) &&
      (!query.paymentId || n.paymentId === query.paymentId),
  )
  return mockRespond(rows)
}

export function mockGetOwnerResults(result?: OwnerSecurityResult): Promise<OwnerPaymentResult[]> {
  const rows = buildMockOwnerResults(new Date()).filter((r) => !result || r.result === result)
  return mockRespond(rows)
}

export async function mockGetBuyerConfirmRequest(token: string): Promise<BuyerConfirmRequest> {
  const now = new Date()
  const { link, payment } = findLink(token, now)
  return mockRespond({
    merchantName: MERCHANT_NAME,
    orderTitle: payment.orderTitle,
    amount: payment.amount,
    paidAt: payment.requestedAt,
    expiresAt: new Date(now.getTime() + link.expiresInMinutes * 60_000).toISOString(),
    answered: answers.get(token)?.answer ?? null,
  })
}

export async function mockAnswerBuyerConfirm(
  token: string,
  answer: BuyerAnswer,
): Promise<BuyerConfirmation> {
  const { payment } = findLink(token, new Date())
  if (answers.has(token)) throw new ConfirmAlreadyAnsweredError()
  const saved: BuyerConfirmation = {
    confirmationId: String(answers.size + 1),
    paymentId: payment.paymentId,
    answer,
    respondedAt: new Date().toISOString(),
  }
  answers.set(token, saved)
  return mockRespond(saved)
}
