import { Tag } from 'antd'
import type { ReportStep } from '../../types/report'
import { runningText, seconds, STEP_ICON, stepStarts, traceSummary } from '../../utils/reportView'

interface TracePanelProps {
  steps: ReportStep[]
  // 실시간 모드: 사건 화면에서 조사 중일 때 (진행 중인 단계 · 경과 시간)
  live?: boolean
  startedAt?: string
  // 실시간 모드에서 경과 시간을 잴 기준 시각 (부르는 쪽이 넘긴다)
  now?: Date
  // 사후 모드에서 쓴 모델 이름
  model?: string
}

// AI가 조사한 과정 — 단계마다 무엇을 묻고 받았는지 (요약만, 원본 데이터 · 프롬프트 전문은 없음)
export function TracePanel({ steps, live = false, startedAt, now, model }: TracePanelProps) {
  const sum = traceSummary(steps)
  const elapsed = live && startedAt && now ? now.getTime() - Date.parse(startedAt) : sum.totalMs
  const current = steps.find((s) => s.status === 'RUNNING')
  const starts = stepStarts(steps)

  return (
    <div className="dw-trace">
      <div className="dw-trace-badges">
        {live ? (
          <>
            <Tag color="red">● 실시간 · {seconds(Math.max(0, elapsed))} 경과</Tag>
            <Tag color="processing">지금: {current?.label ?? '마무리 중'}</Tag>
          </>
        ) : (
          <Tag>총 {seconds(sum.totalMs)}</Tag>
        )}
        <Tag color="green">Tool 호출 {sum.toolCalls}회 · 모두 읽기 전용</Tag>
        {sum.retries > 0 && <Tag color="gold">AI 답 다시 쓰기 {sum.retries}회</Tag>}
        {!live && model && <Tag color="blue">{model}</Tag>}
      </div>
      <ol className="dw-trace-list">
        {steps.map((s, i) => {
          const start = starts.at(i) ?? 0
          const running = s.status === 'RUNNING'
          const failed = s.kind === 'LLM_FAILED' || s.status === 'FAILED'
          const width = running
            ? 30
            : Math.max(4, Math.round(((s.durationMs ?? 0) / sum.maxMs) * 100))
          return (
            <li
              key={s.stepNo}
              className={`dw-trace-step dw-trace-${s.kind.toLowerCase()}${running ? ' is-running' : ''}`}
            >
              <span className="dw-trace-dot" aria-hidden>
                {STEP_ICON[s.kind]}
              </span>
              <details className="dw-trace-box" open={running || failed}>
                <summary>
                  <span className="dw-trace-name">
                    {s.label}
                    {s.toolName && <code className="dw-trace-toolname">{s.toolName}</code>}
                  </span>
                  <span className="dw-trace-meta">
                    {failed && !running && <Tag color="gold">다시 시도</Tag>}
                    {running && <Tag color="processing">{runningText(s.kind)}</Tag>}
                    <span className="dw-muted dw-small">{seconds(start)} ~</span>
                    <span className="dw-trace-bar">
                      <i className={running ? 'is-moving' : ''} style={{ width: `${width}%` }} />
                    </span>
                    <b className="dw-small">{running ? '…' : seconds(s.durationMs ?? 0)}</b>
                  </span>
                </summary>
                <dl className="dw-rule-rows dw-trace-detail">
                  <dt>물어봄</dt>
                  <dd>{s.asked}</dd>
                  <dt>받음</dt>
                  <dd>{s.got ?? <span className="dw-muted">기다리는 중…</span>}</dd>
                </dl>
              </details>
            </li>
          )
        })}
      </ol>
      <p className="dw-muted dw-small">
        AI는 허용된 읽기 전용 Tool만 부를 수 있고 결제를 바꾸지 않아요. 기록에는 요약만 남기고 원본
        데이터 · 프롬프트 전문은 남기지 않아요.
      </p>
    </div>
  )
}
