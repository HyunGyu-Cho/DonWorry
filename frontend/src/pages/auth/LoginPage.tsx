import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Input } from 'antd'
import {
  ArrowLeftOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { ApiError } from '../../api/client'
import { AccountLockedError, InvalidCredentialsError, InvalidOtpError } from '../../api/auth'
import type { LoginProgress } from '../../auth/authStore'
import type { ChallengeMethod, ChallengeReason } from '../../types/auth'
import type { Scenario } from '../../config/scenarios'

export type LoginValues = { loginId: string; password: string }
type LoginPageProps = {
  // 1단계: 아이디 · 비밀번호 → 끝났거나 OTP가 남음
  onSubmit?: (values: LoginValues) => Promise<LoginProgress>
  // 2단계: 인증 앱 6자리 · 1회용 복구 코드
  onOtp?: (challengeId: string, code: string) => Promise<void>
  onRecovery?: (challengeId: string, recoveryCode: string) => Promise<void>
  // Mock 모드에서만 시연 계정 안내를 보인다
  demoHint?: boolean
  // 랜딩에서 고른 시연 시나리오 — 아이디만 채우고 비밀번호는 채우지 않는다
  scenario?: Scenario | null
}
type Feedback = 'ready' | 'invalid' | 'input' | 'network' | 'otp' | 'recovery' | 'locked'
type Challenge = {
  challengeId: string
  expiresAt: string
  method: ChallengeMethod
  sentTo: string | null
  reason: ChallengeReason | null
}

// 사장님 이메일 확인 — 왜 한 번 더 묻는지 처음 보는 사람 말로
const EMAIL_REASON: Record<ChallengeReason, string> = {
  NEW_DEVICE: '처음 보는 기기에서 로그인했어요.',
  FAILED_ATTEMPTS: '비밀번호가 여러 번 틀려서 한 번 더 확인해요.',
}

const feedbackMessages: Record<Feedback, string> = {
  ready: '로그인 기능 연결 준비 중입니다.',
  input: '아이디와 비밀번호를 확인해 주세요.',
  invalid: '아이디 또는 비밀번호가 올바르지 않습니다.',
  network: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  otp: '인증 코드가 맞지 않습니다. 인증 앱의 최신 6자리를 입력해 주세요.',
  recovery: '복구 코드가 맞지 않거나 이미 사용한 코드입니다.',
  locked: '인증 실패가 반복되어 계정이 잠겼습니다. 보안 관리자에게 잠금 해제를 요청하세요.',
}

function toFeedback(error: unknown, step: 'password' | 'otp' | 'recovery'): Feedback {
  if (error instanceof AccountLockedError) return 'locked'
  if (error instanceof InvalidCredentialsError) return 'invalid'
  if (error instanceof InvalidOtpError) return step === 'recovery' ? 'recovery' : 'otp'
  if (error instanceof ApiError && error.status === 400) return 'input'
  return 'network'
}

// 남은 시간 "4:59", 끝나면 null
function useRemaining(expiresAt: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [expiresAt])
  if (!expiresAt) return null
  const left = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000))
  return left === 0 ? null : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
}

export function LoginPage({
  onSubmit,
  onOtp,
  onRecovery,
  demoHint = false,
  scenario = null,
}: LoginPageProps) {
  const submittingRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [useRecovery, setUseRecovery] = useState(false)
  const [otp, setOtp] = useState('')
  const remaining = useRemaining(challenge?.expiresAt ?? null)

  // 한 번에 하나만 보낸다 (두 번 눌러 OTP가 두 번 틀린 것으로 세지지 않게)
  const run = async (step: 'password' | 'otp' | 'recovery', task: () => Promise<void>) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setFeedback(null)
    try {
      await task()
    } catch (error) {
      const next = toFeedback(error, step)
      setFeedback(next)
      if (step === 'otp') setOtp('')
      // 잠기면 처음 화면으로 돌아가 같은 요청을 다시 쓰지 않게 한다
      if (next === 'locked') setChallenge(null)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const submitPassword = (values: LoginValues) => {
    if (!onSubmit) {
      setFeedback('ready')
      return
    }
    void run('password', async () => {
      const progress = await onSubmit({ loginId: values.loginId.trim(), password: values.password })
      if (!progress.done) {
        setChallenge({
          challengeId: progress.challengeId,
          expiresAt: progress.expiresAt,
          method: progress.method,
          sentTo: progress.sentTo,
          reason: progress.reason,
        })
        setUseRecovery(false)
        setOtp('')
      }
    })
  }

  const submitOtp = (code: string) => {
    if (!challenge || !onOtp || code.length !== 6) return
    void run('otp', () => onOtp(challenge.challengeId, code))
  }

  const backToPassword = () => {
    setChallenge(null)
    setFeedback(null)
    setOtp('')
  }

  const byEmail = challenge?.method === 'EMAIL'
  const alert = feedback && (
    <div role={feedback === 'ready' ? 'status' : 'alert'} className="dw-login-error">
      <Alert
        type={feedback === 'ready' ? 'info' : 'error'}
        showIcon
        message={
          feedback === 'otp' && byEmail
            ? '코드가 맞지 않습니다. 메일로 받은 최신 6자리를 입력해 주세요.'
            : feedbackMessages[feedback]
        }
      />
    </div>
  )

  return (
    <main className="dw-login-shell">
      <div className="dw-login-layout">
        <section className="dw-login-intro" aria-labelledby="login-intro-title">
          <div className="dw-login-brand">
            돈워리<span>DonWorry</span>
          </div>
          <div className="dw-login-intro-body">
            <div className="dw-login-symbol">
              <SafetyCertificateOutlined />
            </div>
            <p className="dw-login-eyebrow">안심할 수 있는 거래의 시작</p>
            <h1 id="login-intro-title">
              의심 거래는 꼼꼼하게,
              <br />
              가맹점 운영은 편안하게.
            </h1>
            <p className="dw-login-copy">
              이상 거래 확인부터 조치 결과까지.
              <br />
              돈워리에서 한눈에 확인하세요.
            </p>
            <div className="dw-login-features">
              <span>이상 거래 확인</span>
              <span>사건 검토 및 조치</span>
              <span>가맹점 현황 조회</span>
            </div>
          </div>
          <p className="dw-login-intro-footer">거래를 살피고, 안심을 더합니다.</p>
        </section>
        <section className="dw-login-box" aria-labelledby="login-title">
          {!challenge ? (
            <>
              <h2 id="login-title">로그인</h2>
              <p className="dw-login-description">계정으로 로그인하고 업무를 시작하세요.</p>
              {scenario && (
                <Alert
                  className="dw-login-scenario"
                  type="info"
                  showIcon
                  message={`시나리오 ${scenario.mark} ${scenario.title}`}
                  description={`${scenario.roleLabel} 계정을 채워 두었어요. 비밀번호를 넣고 로그인하세요.`}
                />
              )}
              <Form<LoginValues>
                layout="vertical"
                onFinish={submitPassword}
                onValuesChange={() => setFeedback(null)}
                requiredMark={false}
                initialValues={scenario ? { loginId: scenario.loginId } : undefined}
                size="large"
                disabled={submitting}
              >
                <Form.Item
                  label="아이디"
                  name="loginId"
                  rules={[
                    { required: true, whitespace: true, message: '아이디를 입력해 주세요.' },
                    {
                      max: 100,
                      transform: (value: string) => value?.trim(),
                      message: '아이디는 100자 이하로 입력해 주세요.',
                    },
                  ]}
                >
                  <Input
                    prefix={<UserOutlined />}
                    placeholder="아이디를 입력하세요"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </Form.Item>
                <Form.Item
                  label="비밀번호"
                  name="password"
                  rules={[
                    { required: true, whitespace: true, message: '비밀번호를 입력해 주세요.' },
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined />}
                    placeholder="비밀번호를 입력하세요"
                    autoComplete="current-password"
                  />
                </Form.Item>
                {alert}
                <Button type="primary" htmlType="submit" loading={submitting} block>
                  로그인
                </Button>
              </Form>
              {demoHint && (
                <div className="dw-login-demo">
                  <h3>시연 계정 (Mock 모드)</h3>
                  <p>
                    보안 직원 jiwon · 보안 관리자 yunseo · 사장님 boss — 비밀번호 1234
                    <br />
                    직원 OTP 246810 · 복구 코드 DW-RECOVERY-0001 · 사장님 새 기기 이메일 코드 135790
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <h2 id="login-title">
                {useRecovery
                  ? '복구 코드로 로그인'
                  : byEmail
                    ? '이메일로 한 번 더 확인할게요'
                    : '2단계 인증'}
              </h2>
              <p className="dw-login-description">
                {useRecovery
                  ? '처음 OTP를 등록할 때 받은 1회용 복구 코드를 입력하세요. 한 번 쓰면 다시 쓸 수 없습니다.'
                  : byEmail
                    ? `${challenge.reason ? EMAIL_REASON[challenge.reason] : ''} 가입한 이메일 ${challenge.sentTo ?? ''}로 보낸 6자리를 넣어 주세요.`
                    : '휴대폰 인증 앱에 보이는 6자리 숫자를 입력하세요. 비밀번호가 새도 이 번호가 없으면 로그인할 수 없습니다.'}
              </p>
              {byEmail && (
                <div className="dw-login-otp-help">
                  <b>왜 한 번 더 확인하나요?</b>
                  <span>
                    비밀번호가 새도 이메일까지 가진 사람만 들어올 수 있게 해요. 평소 쓰던 기기에서는
                    묻지 않아요. 메일이 안 보이면 스팸함도 확인해 주세요.
                  </span>
                  {demoHint && (
                    <span className="dw-login-otp-demo">
                      시연(Mock) 모드에서는 메일 대신 고정 코드 <b>135790</b>을 넣어요.
                    </span>
                  )}
                </div>
              )}
              {/* 처음 쓰는 사람이 "6자리를 어디서 받지?"에서 막히지 않게 */}
              {!useRecovery && !byEmail && (
                <div className="dw-login-otp-help">
                  <b>6자리는 어디서 보나요?</b>
                  <span>
                    처음 계정을 만들 때 휴대폰 인증 앱(Google Authenticator 등)에 돈워리를 등록해요.
                    앱을 열면 30초마다 바뀌는 6자리가 보여요.
                  </span>
                  {demoHint && (
                    <span className="dw-login-otp-demo">
                      시연(Mock) 모드에서는 인증 앱 대신 고정 코드 <b>246810</b>을 넣어요.
                    </span>
                  )}
                </div>
              )}
              {remaining ? (
                <p className="dw-login-timer" role="timer">
                  남은 시간 <b>{remaining}</b>
                </p>
              ) : (
                <div role="alert" className="dw-login-error">
                  <Alert
                    type="warning"
                    showIcon
                    message="인증 시간이 지났습니다. 처음부터 다시 로그인해 주세요."
                  />
                </div>
              )}
              {useRecovery ? (
                <Form<{ recoveryCode: string }>
                  layout="vertical"
                  requiredMark={false}
                  size="large"
                  disabled={submitting || !remaining}
                  onValuesChange={() => setFeedback(null)}
                  onFinish={({ recoveryCode }) =>
                    challenge &&
                    onRecovery &&
                    void run('recovery', () => onRecovery(challenge.challengeId, recoveryCode))
                  }
                >
                  <Form.Item
                    label="복구 코드"
                    name="recoveryCode"
                    rules={[
                      { required: true, whitespace: true, message: '복구 코드를 입력해 주세요.' },
                    ]}
                  >
                    <Input
                      placeholder="DW-RECOVERY-0000"
                      autoCapitalize="characters"
                      autoComplete="one-time-code"
                      spellCheck={false}
                    />
                  </Form.Item>
                  {alert}
                  <Button type="primary" htmlType="submit" loading={submitting} block>
                    복구 코드로 로그인
                  </Button>
                </Form>
              ) : (
                <div className="dw-login-otp">
                  <Input.OTP
                    length={6}
                    size="large"
                    value={otp}
                    disabled={submitting || !remaining}
                    formatter={(value) => value.replace(/\D/g, '')}
                    aria-label={byEmail ? '이메일 확인 코드 6자리' : '인증 코드 6자리'}
                    onChange={(value) => {
                      setOtp(value)
                      submitOtp(value)
                    }}
                  />
                  {alert}
                  <Button
                    type="primary"
                    size="large"
                    block
                    loading={submitting}
                    disabled={otp.length !== 6 || !remaining}
                    onClick={() => submitOtp(otp)}
                  >
                    확인
                  </Button>
                </div>
              )}
              <div className="dw-login-links">
                <Button type="link" icon={<ArrowLeftOutlined />} onClick={backToPassword}>
                  처음으로
                </Button>
                {!byEmail && (
                  <Button
                    type="link"
                    onClick={() => {
                      setUseRecovery((v) => !v)
                      setFeedback(null)
                    }}
                  >
                    {useRecovery ? '인증 앱으로 입력' : '인증 앱을 잃었어요'}
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
