import { Button, Tag } from 'antd'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { demoBuyerAnswered } from '../../api/report'
import { useAuth } from '../../auth/useAuth'
import { MAILPIT_URL } from '../../config/demoLinks'
import { SCENARIOS, scenarioById } from '../../config/scenarios'
import { TUTORIAL_STEPS } from '../../config/tutorialSteps'
import { isDone, progressText, resolveStep } from '../../utils/tutorialView'
import { useScreenMode } from '../explain/useScreenMode'
import { DEMO_CHANGED, TUTORIAL_EVENT, tutorialStore, useTutorial } from './tutorialStore'

// 카드가 놓일 수 있는 자리 (CSS .dw-tut · .dw-tut--left와 같게) — 오른쪽 아래, 메뉴 옆 왼쪽 아래
const CARD_W = 340
const CARD_GAP = 20
const LEFT_X = 240

// right = 기본 자리, left = 왼쪽 아래로 비킴, mini = 어느 쪽도 대상을 가려서 작게 접음
export type CardPlace = 'right' | 'left' | 'mini'

// 노란 테두리 — 화면이 늦게 그려져도 붙도록 잠깐씩 다시 찾는다. 없으면 조용히 넘어간다
// 테두리 대상이 카드 자리와 겹치면 비킬 자리를 고른다 (오른쪽 → 왼쪽 → 작게 접기)
function useTourHighlight(target: string | undefined, cardHeight: number) {
  const [place, setPlace] = useState<CardPlace>('right')
  useEffect(() => {
    if (!target) return
    const overlaps = (el: Element, x: number) => {
      const r = el.getBoundingClientRect()
      const top = window.innerHeight - CARD_GAP - cardHeight
      return (
        r.width > 0 &&
        r.right > x &&
        r.left < x + CARD_W &&
        r.bottom > top &&
        r.top < window.innerHeight
      )
    }
    const mark = () => {
      // 한 요소에 이름표가 여러 개일 수 있고, 단계도 대상 여러 개를 가리킬 수 있다 (둘 다 띄어쓰기로 구분)
      const wanted = target.split(' ')
      const names = (el: Element) => (el.getAttribute('data-tour') ?? '').split(' ')
      document.querySelectorAll('.dw-tour-on').forEach((el) => {
        if (!names(el).some((n) => wanted.includes(n))) el.classList.remove('dw-tour-on')
      })
      const found = wanted.flatMap((w) => [...document.querySelectorAll(`[data-tour~="${w}"]`)])
      // 좁은 화면에서 메뉴가 ☰ 속에 닫혀 있으면 메뉴 대신 ☰ 버튼에 테두리
      const toggle = document.querySelector('.dw-menu-toggle')
      const hiddenNav = found.some((el) => el.closest('.dw-sidebar:not(.is-open)'))
      if (toggle && hiddenNav && getComputedStyle(toggle).display !== 'none') found.push(toggle)
      else toggle?.classList.remove('dw-tour-on')
      found.forEach((el) => el.classList.add('dw-tour-on'))
      // 카드 안의 버튼(tutorial-actions)은 피할 필요가 없다. 좁은 화면은 카드가 화면 폭이라 그대로
      const targets = found.filter((el) => !el.closest('.dw-tut'))
      if (window.innerWidth <= 600 || targets.length === 0) return setPlace('right')
      const rightX = window.innerWidth - CARD_GAP - CARD_W
      const hits = (x: number) => targets.some((el) => overlaps(el, x))
      setPlace(!hits(rightX) ? 'right' : !hits(LEFT_X) ? 'left' : 'mini')
    }
    const first = setTimeout(mark, 0)
    const timer = setInterval(mark, 400)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      document.querySelectorAll('.dw-tour-on').forEach((el) => el.classList.remove('dw-tour-on'))
    }
  }, [target, cardHeight])
  return target ? place : 'right'
}

// 튜토리얼 패널 — 오른쪽 아래 안내 카드 (튜토리얼 모드에서만)
export function TutorialPanel() {
  const { mode } = useScreenMode()
  const { user, store } = useAuth()
  const { pathname } = useLocation()
  const tutorial = useTutorial()
  const scenario = tutorial.scenarioId === null ? null : scenarioById(tutorial.scenarioId)
  const steps = scenario ? TUTORIAL_STEPS[scenario.id] : []
  const wrongUser = !!scenario && !!user && user.loginId !== scenario.loginId
  const active = mode === 'TUTORIAL' && !!scenario && !wrongUser
  // 안내한 화면에 들어오면 그 단계로
  const effective = active ? resolveStep(steps, tutorial, pathname) : tutorial.step
  useEffect(() => {
    if (active && (effective !== tutorial.step || tutorial.path !== pathname)) {
      tutorialStore.setStep(effective, pathname)
    }
  }, [active, effective, tutorial.step, tutorial.path, pathname])

  const done = isDone(steps, effective)
  const step = active && !done ? steps[effective] : undefined
  const place = useTourHighlight(
    mode === 'TUTORIAL' && !tutorial.collapsed ? step?.target : undefined,
    320,
  )
  const navigate = useNavigate()
  // 화면이 알린 일(예: 판정 확정)을 이 단계가 기다리고 있었으면 다음 단계로
  const doneOn = step?.doneOn
  useEffect(() => {
    if (!doneOn) return
    const onEvent = (e: Event) => {
      if ((e as CustomEvent<string>).detail === doneOn) {
        tutorialStore.setStep(effective + 1, window.location.pathname)
      }
    }
    window.addEventListener(TUTORIAL_EVENT, onEvent)
    return () => window.removeEventListener(TUTORIAL_EVENT, onEvent)
  }, [doneOn, effective])
  const [busy, setBusy] = useState(false)
  const [rerunSent, setRerunSent] = useState(false)
  const [openedStep, setOpenedStep] = useState<number | null>(null)

  const cardClass = `dw-tut${place === 'left' ? ' dw-tut--left' : ''}`
  if (mode !== 'TUTORIAL') return null
  // 어느 쪽에 둬도 대상을 가리면 작게 접어 둔다 — 누르면 이 단계 동안은 펼쳐 둔다
  if (place === 'mini' && openedStep !== effective && !tutorial.collapsed) {
    return (
      <button
        type="button"
        className="dw-tut-fab"
        onClick={() => setOpenedStep(effective)}
        aria-label="튜토리얼 안내 펼치기"
      >
        🧭 {scenario?.mark} {progressText(steps, effective)} · {step?.todo ?? '안내 펼치기'}
      </button>
    )
  }
  if (tutorial.collapsed) {
    return (
      <button
        type="button"
        className="dw-tut-fab"
        onClick={() => tutorialStore.setCollapsed(false)}
        aria-label="튜토리얼 안내 펼치기"
      >
        🧭 안내 {scenario && !done ? `${scenario.mark} ${progressText(steps, effective)}` : '열기'}
      </button>
    )
  }

  const head = (
    <div className="dw-tut-head">
      <b>{scenario ? `${scenario.mark} ${scenario.title}` : '튜토리얼'}</b>
      <Button size="small" type="text" onClick={() => tutorialStore.setCollapsed(true)}>
        접기
      </Button>
    </div>
  )

  // 시나리오 고르기 — 지금 계정으로 할 수 있는 것만
  if (!scenario || wrongUser) {
    const mine = SCENARIOS.filter((s) => s.loginId === user?.loginId)
    return (
      <aside className={cardClass} aria-label="튜토리얼 안내">
        {head}
        {wrongUser && scenario && (
          <p className="dw-tut-warn">
            시나리오 {scenario.mark}은 {scenario.roleLabel} 계정으로 해요. 로그아웃하고 다시 골라
            주세요.
          </p>
        )}
        <p className="dw-muted dw-small">지금 계정으로 해 볼 수 있는 시나리오예요.</p>
        <div className="dw-tut-pick">
          {mine.map((s) => (
            <Button key={s.id} block onClick={() => tutorialStore.start(s.id)}>
              {s.mark} {s.title} · 약 {s.minutes}분
            </Button>
          ))}
          {mine.length === 0 && <p className="dw-muted">이 계정으로 하는 시나리오가 없어요.</p>}
        </div>
        <Link to="/" className="dw-small">
          다른 역할의 시나리오는 랜딩에서 →
        </Link>
      </aside>
    )
  }

  const restart = () => {
    tutorialStore.setStep(0, null)
    // 새로 고침하면 시연 데이터(Mock)가 처음 상태로 돌아간다
    window.location.assign(steps[0].path)
  }

  if (done) {
    const next = SCENARIOS.find((s) => s.id === scenario.id + 1)
    return (
      <aside className={cardClass} aria-label="튜토리얼 안내">
        {head}
        <p className="dw-tut-title">시나리오 {scenario.mark} 끝 · 이런 걸 봤어요</p>
        <ul className="dw-tut-list">
          {steps.map((s) => (
            <li key={s.title}>{s.title}</li>
          ))}
        </ul>
        <div className="dw-tut-actions">
          <Button onClick={restart}>처음부터 다시</Button>
          {next &&
            (next.loginId === user?.loginId ? (
              <Button type="primary" onClick={() => tutorialStore.start(next.id)}>
                다음 시나리오 {next.mark}
              </Button>
            ) : (
              <Button
                type="primary"
                onClick={async () => {
                  // 다른 계정 시나리오 — 로그아웃하고 그 시나리오의 로그인 화면으로 바로
                  await store.logout().catch(() => undefined)
                  navigate(`/login?scenario=${next.id}`)
                }}
              >
                다음 시나리오 {next.mark} (로그아웃 후 {next.roleLabel})
              </Button>
            ))}
        </div>
      </aside>
    )
  }

  const current = steps[effective]
  const buyerAnswered = async () => {
    if (!demoBuyerAnswered) return
    setBusy(true)
    try {
      await demoBuyerAnswered()
      setRerunSent(true)
      window.dispatchEvent(new Event(DEMO_CHANGED))
      tutorialStore.setStep(effective + 1, pathname)
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className={cardClass} aria-label="튜토리얼 안내">
      {head}
      <div className="dw-tut-progress">
        <span>{progressText(steps, effective)}</span>
        <div className="dw-tut-bar">
          <i style={{ width: `${((effective + 1) / steps.length) * 100}%` }} />
        </div>
      </div>
      <p className="dw-tut-title">{current.title}</p>
      <p className="dw-tut-todo">
        <Tag color="gold">지금 할 일</Tag>
        {current.todo}
      </p>
      <ul className="dw-tut-list">
        {current.look.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {current.special === 'WAIT' && (
        <p className="dw-muted dw-small">약 10초 걸려요. 끝나면 [다음]을 눌러 주세요.</p>
      )}
      {current.special === 'RERUN' && (
        <div className="dw-tut-special" data-tour="tutorial-actions">
          <a href="/confirm/demo-check-31" target="_blank" rel="noreferrer">
            <Button size="small">구매자 화면 열기 ↗</Button>
          </a>
          {MAILPIT_URL && (
            <a href={MAILPIT_URL} target="_blank" rel="noreferrer">
              <Button size="small">Mailpit 열기 ↗</Button>
            </a>
          )}
          {demoBuyerAnswered ? (
            <Button
              size="small"
              type="primary"
              loading={busy}
              disabled={rerunSent}
              onClick={() => void buyerAnswered()}
            >
              구매자 답변 도착시키기 (시연)
            </Button>
          ) : (
            <span className="dw-muted dw-small">
              실제 서버에서는 구매자 화면에서 답하면 다시 조사가 시작돼요.
            </span>
          )}
        </div>
      )}
      <div className="dw-tut-actions">
        <Button
          size="small"
          disabled={effective === 0}
          onClick={() => tutorialStore.setStep(effective - 1, pathname)}
        >
          이전
        </Button>
        <Button
          size="small"
          type="primary"
          onClick={() => tutorialStore.setStep(effective + 1, pathname)}
        >
          {effective === steps.length - 1 ? '끝내기' : '다음'}
        </Button>
      </div>
      <div className="dw-tut-foot">
        <button type="button" onClick={restart}>
          처음부터 다시
        </button>
        <button type="button" onClick={() => tutorialStore.stop()}>
          시나리오 바꾸기
        </button>
      </div>
    </aside>
  )
}
