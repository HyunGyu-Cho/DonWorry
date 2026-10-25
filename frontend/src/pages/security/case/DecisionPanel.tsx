import { Alert, Button, Card, Input, Radio, Tag } from 'antd'
import { useState } from 'react'
import { useFeedback } from '../../../components/common/Feedback'
import type {
  AiRecommendation,
  CasePayment,
  Decision,
  PaymentDecision,
  SubmitDecisionsRequest,
} from '../../../types/case'
import type { PaymentRecommendation } from '../../../types/report'
import type { DecisionMode } from '../../../utils/caseRules'
import { koreanWon, relativeTime } from '../../../utils/humanize'

type Draft = { decision?: Decision; reason: string }

const DECISION_TEXT: Record<Decision, string> = { ACCEPT: '매입 허용', REJECT: '승인 취소' }
const REC_TEXT: Record<AiRecommendation, [string, string]> = {
  ACCEPT_REVIEW: ['매입 진행 검토', 'green'],
  REJECT_REVIEW: ['승인 취소 검토', 'red'],
  NEEDS_CHECK: ['추가 확인 먼저', 'gold'],
}

// AI 권고와 반대인 판정 (권고가 취소인데 허용) — 1-5b에서 재인증 + 관리자 승인이 붙는다
const opposite = (rec: AiRecommendation | undefined, d: Decision | undefined) =>
  rec === 'REJECT_REVIEW' && d === 'ACCEPT'

/**
 * 결제별 매입 허용 / 승인 취소 판정 (기획 2.8). 전체 선택은 편의 기능이고 저장은 결제별로 된다.
 * 확정된 판정은 MVP에서 정정하지 않으므로 잠근다.
 */
export function DecisionPanel(props: {
  payments: CasePayment[]
  // 결제 번호 → 화면 이름 (예: 단체 행사용 케이크 세트)
  titleOf: (paymentId: string) => string
  decisions: PaymentDecision[]
  recommendations: PaymentRecommendation[]
  mode: DecisionMode
  evidenceVersion: number
  // 저장 성공 여부. 오류 안내는 호출한 쪽이 한다
  onSubmit: (request: SubmitDecisionsRequest) => Promise<boolean>
}) {
  const { payments, titleOf, decisions, recommendations, mode, evidenceVersion, onSubmit } = props
  const { confirmDanger } = useFeedback()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const decisionOf = (id: string) => decisions.find((d) => d.casePaymentId === id)
  const recOf = (paymentId: string) =>
    recommendations.find((r) => r.paymentId === paymentId)?.recommendation
  const undecided = payments.filter((p) => !decisionOf(p.casePaymentId))
  const editable = mode.kind !== 'blocked' && undecided.length > 0
  const draftOf = (id: string): Draft => drafts[id] ?? { reason: '' }
  const update = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...draftOf(id), ...patch } }))
  const setAll = (decision: Decision) =>
    setDrafts((prev) => {
      const next = { ...prev }
      for (const p of undecided) next[p.casePaymentId] = { ...draftOf(p.casePaymentId), decision }
      return next
    })

  const selected = undecided.filter((p) => draftOf(p.casePaymentId).decision)
  const missingReason = selected.some((p) => !draftOf(p.casePaymentId).reason.trim())
  const anyOpposite = selected.some((p) =>
    opposite(recOf(p.paymentId), draftOf(p.casePaymentId).decision),
  )

  const submit = () => {
    const accept = selected.filter((p) => draftOf(p.casePaymentId).decision === 'ACCEPT').length
    confirmDanger({
      title: `결제 ${selected.length}건의 판정을 확정할까요?`,
      content: `매입 허용 ${accept}건 · 승인 취소 ${selected.length - accept}건. 확정한 판정은 바꿀 수 없고, 바로 조치가 요청됩니다.`,
      onConfirm: async () => {
        const saved = await onSubmit({
          evidenceVersion,
          reportId: mode.kind === 'normal' ? mode.report.reportId : null,
          decisions: selected.map((p) => ({
            casePaymentId: p.casePaymentId,
            decision: draftOf(p.casePaymentId).decision as Decision,
            reason: draftOf(p.casePaymentId).reason.trim(),
          })),
        })
        if (saved) setDrafts({})
      },
    })
  }

  return (
    <Card
      title={undecided.length > 0 ? '직원 판정' : '판정 결과'}
      extra={
        editable && (
          <span className="dw-pa-chips">
            <Button size="small" onClick={() => setAll('ACCEPT')}>
              전체 매입 허용
            </Button>
            <Button size="small" onClick={() => setAll('REJECT')}>
              전체 승인 취소
            </Button>
          </span>
        )
      }
    >
      <div className="dw-case-decision">
        {mode.kind === 'manual' && undecided.length > 0 && (
          <Alert
            type="warning"
            showIcon
            message="AI 보고서 없이 판정합니다"
            description="AI 조사가 세 번 실패했어요. 사유에 직접 조사한 근거를 적어 주세요."
          />
        )}
        {mode.kind === 'blocked' && undecided.length > 0 && (
          <Alert type="info" showIcon message={mode.message} />
        )}
        {payments.map((p) => {
          const decided = decisionOf(p.casePaymentId)
          const draft = draftOf(p.casePaymentId)
          const rec = recOf(p.paymentId)
          return (
            <div key={p.casePaymentId} className="dw-case-drow">
              <div className="dw-case-drow-head">
                <div>
                  <b>{titleOf(p.paymentId)}</b>
                  <span className="dw-muted">
                    {' '}
                    · {p.amount === null ? '금액 확인 불가' : koreanWon(p.amount)} ·{' '}
                    {p.riskScore ?? '?'}점
                  </span>
                </div>
                {rec && (
                  <span className="dw-small">
                    AI 권고 <Tag color={REC_TEXT[rec][1]}>{REC_TEXT[rec][0]}</Tag>
                  </span>
                )}
              </div>
              {decided ? (
                <div className="dw-small">
                  <Tag color={decided.decision === 'ACCEPT' ? 'green' : 'red'}>
                    {DECISION_TEXT[decided.decision]}
                  </Tag>
                  {decided.reason}
                  <div className="dw-muted">
                    {relativeTime(decided.decidedAt)} ·{' '}
                    {decided.reportId ? 'AI 보고서를 보고 판정' : '보고서 없이 판정'}
                  </div>
                </div>
              ) : (
                <>
                  <Radio.Group
                    disabled={!editable}
                    value={draft.decision}
                    onChange={(e) => update(p.casePaymentId, { decision: e.target.value })}
                    optionType="button"
                    buttonStyle="solid"
                    size="small"
                    options={[
                      { value: 'ACCEPT', label: '매입 허용' },
                      { value: 'REJECT', label: '승인 취소' },
                    ]}
                  />
                  {opposite(rec, draft.decision) && (
                    <div className="dw-case-opposite">
                      AI 권고와 반대예요. 왜 허용하는지 사유에 근거를 꼭 적어 주세요.
                    </div>
                  )}
                  <Input.TextArea
                    aria-label={`${titleOf(p.paymentId)} 판정 사유`}
                    disabled={!editable}
                    value={draft.reason}
                    onChange={(e) => update(p.casePaymentId, { reason: e.target.value })}
                    placeholder={
                      mode.kind === 'manual' ? '직접 조사한 근거 (필수)' : '판정 사유 (필수)'
                    }
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    maxLength={500}
                  />
                </>
              )}
            </div>
          )
        })}
        {editable && (
          <div className="dw-case-decision-foot">
            <span className="dw-muted dw-small">
              {missingReason
                ? '판정을 고른 결제에 사유를 입력하세요.'
                : anyOpposite
                  ? 'AI 권고와 반대인 판정이 있어요.'
                  : 'AI는 권고만 합니다 · 확정 후 변경 불가'}
            </span>
            <Button
              type="primary"
              disabled={selected.length === 0 || missingReason}
              onClick={submit}
            >
              판정 확정 ({selected.length}건)
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
