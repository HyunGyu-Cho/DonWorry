package com.donworry.investigation.report.service;

import com.donworry.investigation.report.dto.ToolCallRequest;
import com.donworry.investigation.report.dto.ToolResponse;
import com.donworry.investigation.service.PaymentInfoReader;
import com.donworry.investigation.service.PaymentInfoReader.PaymentInfo;
import com.donworry.investigation.service.SimilarCaseService;
import com.donworry.payment.api.PaymentLookup;
import java.text.NumberFormat;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

// AI 증거 조회 창구 (2-19, ADR-0009 Tool 표) — 조사 중인 보고서의 현재 시도만, 그 사건 범위의 데이터만 준다
// 부를 때마다 조회 기록(ReportStepRecorder)을 한 줄 남긴다 — 조사 중 화면 · 보고서 trace에 쓰인다
@Service
@RequiredArgsConstructor
public class ReportToolService {

    static final String NOT_READY_NOTE = "데이터 준비 전";
    // 과거 결제 목록은 최근 10건까지 — AI가 읽는 길이 (요약 · 평균 · 카드별 건수는 이전 결제 전부로)
    static final int HISTORY_LIMIT = 10;

    private final ReportTransitions reportTransitions;
    private final AttemptRegistry attemptRegistry;
    private final PaymentInfoReader paymentInfoReader;
    private final ReportStepRecorder reportStepRecorder;
    private final PaymentLookup paymentLookup;
    private final SimilarCaseService similarCaseService;

    public ToolResponse call(String toolName, ToolCallRequest request) {
        ReportTool tool =
                ReportTool.of(toolName).orElseThrow(() -> new ReportException(ReportErrorCode.TOOL_NOT_FOUND));
        ReportTarget target = currentTarget(request);
        Instant startedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        long clock = System.nanoTime();
        Answer answer = answer(tool, target, request.args() == null ? Map.of() : request.args());
        int durationMs = (int) ((System.nanoTime() - clock) / 1_000_000);
        reportStepRecorder.tool(target.reportId(), request.attemptId(), tool, answer.summary(), startedAt, durationMs);
        String note = tool.ready() ? null : NOT_READY_NOTE;
        return new ToolResponse(tool.toolName(), tool.ready(), note, answer.data());
    }

    // 조사 중(PENDING · RUNNING)이고 현재 시도일 때만 — 끝났거나 대체된 보고서 · 옛 시도는 거절
    private ReportTarget currentTarget(ToolCallRequest request) {
        if (request.reportId() == null
                || !attemptRegistry.isCurrent(request.reportId(), request.attemptId())
                || reportTransitions.isFinished(request.reportId())) {
            throw new ReportException(ReportErrorCode.NOT_CURRENT_ATTEMPT);
        }
        return reportTransitions
                .target(request.reportId())
                .orElseThrow(() -> new ReportException(ReportErrorCode.NOT_CURRENT_ATTEMPT));
    }

    private record Answer(List<Map<String, Object>> data, String summary) {}

    private Answer answer(ReportTool tool, ReportTarget target, Map<String, Object> args) {
        return switch (tool) {
            case GET_CASE_PAYMENTS -> casePayments(target);
            case GET_FDS_EVIDENCE -> fdsEvidence(target, args);
            case GET_ORDER_CONTEXT -> orderContext(target);
            case GET_PAYMENT_HISTORY -> paymentHistory(target);
            case GET_PAYMENT_AUTHENTICATION -> paymentAuthentication(target);
            case FIND_SIMILAR_CASES -> similarCases(target);
            default -> new Answer(List.of(), NOT_READY_NOTE);
        };
    }

    private Answer casePayments(ReportTarget target) {
        List<Map<String, Object>> rows = new ArrayList<>();
        long total = 0;
        for (Long paymentId : reportTransitions.casePaymentIds(target.caseId())) {
            Optional<PaymentInfo> info = paymentInfoReader.find(paymentId);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("paymentId", String.valueOf(paymentId));
            row.put("amount", info.map(PaymentInfo::amount).orElse(null));
            row.put("paymentStatus", info.map(PaymentInfo::paymentStatus).orElse(null));
            row.put(
                    "requestedAt",
                    info.map(i -> String.valueOf(i.requestedAt())).orElse(null));
            rows.add(row);
            total += info.map(PaymentInfo::amount).orElse(0L);
        }
        return new Answer(rows, "결제 " + rows.size() + "건 · 합계 " + won(total));
    }

    // 주문 이름 · 구매자 본인 확인 응답 (#82) — 배송 · 픽업은 CakeShop 연동(2-29)에서
    private Answer orderContext(ReportTarget target) {
        List<Map<String, Object>> rows = new ArrayList<>();
        List<String> answers = new ArrayList<>();
        for (Long paymentId : reportTransitions.casePaymentIds(target.caseId())) {
            Optional<PaymentInfo> info = paymentInfoReader.find(paymentId);
            Optional<PaymentLookup.BuyerAnswer> buyer = paymentLookup.latestBuyerAnswer(paymentId);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("paymentId", String.valueOf(paymentId));
            row.put("orderTitle", info.map(PaymentInfo::orderTitle).orElse(null));
            row.put("buyerAnswer", buyer.map(PaymentLookup.BuyerAnswer::answer).orElse(null));
            row.put(
                    "respondedAt",
                    buyer.map(b -> String.valueOf(b.respondedAt())).orElse(null));
            rows.add(row);
            answers.add(buyer.map(b -> "NOT_MINE".equals(b.answer()) ? "결제하지 않았어요" : "제가 결제했어요")
                    .orElse("응답 없음"));
        }
        return new Answer(rows, "주문 " + rows.size() + "건 · 구매자 " + String.join(", ", answers));
    }

    // 같은 고객의 이 결제 이전 결제 (#90) — 요약은 전부, 목록은 최근 10건. 지난 결제 번호는 넣지 않는다 (사건 결제와 헷갈림)
    private Answer paymentHistory(ReportTarget target) {
        List<Map<String, Object>> rows = new ArrayList<>();
        List<String> summaries = new ArrayList<>();
        for (Long paymentId : reportTransitions.casePaymentIds(target.caseId())) {
            Optional<PaymentLookup.CustomerHistory> found = paymentLookup.customerHistory(paymentId, HISTORY_LIMIT);
            if (found.isEmpty()) {
                continue;
            }
            PaymentLookup.CustomerHistory history = found.get();
            Long amount =
                    paymentInfoReader.find(paymentId).map(PaymentInfo::amount).orElse(null);
            Double ratio = ratio(amount, history.capturedAverageAmount());
            List<Map<String, Object>> recent = new ArrayList<>();
            for (PaymentLookup.PastPayment past : history.recent()) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("amount", past.amount());
                item.put("orderTitle", past.orderTitle());
                item.put("cardLast4", past.cardLast4());
                item.put("status", past.status());
                item.put("requestedAt", String.valueOf(past.requestedAt()));
                recent.add(item);
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("paymentId", String.valueOf(paymentId));
            row.put("amount", amount);
            row.put("previousPaymentCount", history.totalCount());
            row.put(
                    "firstPaymentAt",
                    history.firstPaymentAt() == null ? null : String.valueOf(history.firstPaymentAt()));
            row.put("capturedCount", history.capturedCount());
            row.put("capturedAverageAmount", history.capturedAverageAmount());
            row.put("capturedMaxAmount", history.capturedMaxAmount());
            row.put("amountToAverageRatio", ratio);
            row.put("capturedCountByCardLast4", history.capturedCountByCard());
            row.put("recentPayments", recent);
            rows.add(row);
            summaries.add(
                    history.capturedCount() == 0
                            ? "이전 결제 " + history.totalCount() + "건 · 완료된 결제 없음"
                            : "이전 완료 결제 " + history.capturedCount() + "건 · 평균 " + won(history.capturedAverageAmount())
                                    + " · 최고 " + won(history.capturedMaxAmount())
                                    + (ratio == null ? "" : " · 이번 " + ratio + "배"));
        }
        return new Answer(rows, summaries.isEmpty() ? "고객 정보 없음" : String.join(", ", summaries));
    }

    // 이 결제의 카드 (#90) — 끝자리 · 국가 · 이 결제 전 이 카드로 완료된 결제 수 · 승인 번호. 카드 지문은 넣지 않는다
    private Answer paymentAuthentication(ReportTarget target) {
        List<Map<String, Object>> rows = new ArrayList<>();
        List<String> summaries = new ArrayList<>();
        for (Long paymentId : reportTransitions.casePaymentIds(target.caseId())) {
            Optional<PaymentLookup.CardUsage> found = paymentLookup.cardUsage(paymentId);
            if (found.isEmpty()) {
                continue;
            }
            PaymentLookup.CardUsage card = found.get();
            Integer completed = card.completedPaymentsWithCard();
            boolean authorized = card.authorizationRef() != null;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("paymentId", String.valueOf(paymentId));
            row.put("cardLast4", card.cardLast4());
            row.put("cardCountry", card.cardCountry());
            row.put("completedPaymentsWithCardBefore", completed);
            row.put("firstUseOfCard", completed == null ? null : completed == 0);
            row.put("authorized", authorized);
            row.put("authorizationRef", card.authorizationRef());
            rows.add(row);
            String usage = completed == null
                    ? "카드 이력 모름"
                    : "이 카드로 완료 " + completed + "건" + (completed == 0 ? "(처음 쓰는 카드)" : "");
            summaries.add("카드 " + (card.cardLast4() == null ? "모름" : card.cardLast4()) + " · " + usage + " · "
                    + (authorized ? "승인됨" : "승인 전"));
        }
        return new Answer(rows, summaries.isEmpty() ? "카드 정보 없음" : String.join(", ", summaries));
    }

    // 판정이 끝난 비슷한 과거 사건 (#104 2-9a, P3 SimilarCaseService) — 근거로만, 자동 판정에 쓰지 않는다. 카드 지문은 없다
    private Answer similarCases(ReportTarget target) {
        List<SimilarCaseService.SimilarCase> found = similarCaseService.find(target.caseId());
        List<Map<String, Object>> rows =
                found.stream().map(SimilarCaseService.SimilarCase::toMap).toList();
        long fraud = found.stream().filter(c -> "FRAUD".equals(c.outcome())).count();
        long strong =
                found.stream().filter(SimilarCaseService.SimilarCase::strong).count();
        String summary = found.isEmpty()
                ? "판정이 끝난 비슷한 사건 없음"
                : "비슷한 사건 " + found.size() + "건 · 사기 " + fraud + "건 · 같은 대상 겹침 " + strong + "건";
        return new Answer(rows, summary);
    }

    // 이번 금액 ÷ 평균, 소수 한 자리. 평균을 모르면 null
    private static Double ratio(Long amount, Long average) {
        if (amount == null || average == null || average == 0) {
            return null;
        }
        return Math.round(amount * 10.0 / average) / 10.0;
    }

    // paymentIds를 주면 그 결제만 (사건 결제가 아니면 거절), 없으면 사건 결제 전부
    private Answer fdsEvidence(ReportTarget target, Map<String, Object> args) {
        List<Long> casePayments = reportTransitions.casePaymentIds(target.caseId());
        List<Long> asked = paymentIdsArg(args.get("paymentIds")).orElse(casePayments);
        if (!casePayments.containsAll(asked)) {
            throw new ReportException(ReportErrorCode.PAYMENT_NOT_IN_CASE);
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        int maxScore = 0;
        int failed = 0;
        List<String> rules = new ArrayList<>();
        for (Long paymentId : asked) {
            Optional<PaymentInfo> info = paymentInfoReader.find(paymentId);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("paymentId", String.valueOf(paymentId));
            row.put("riskScore", info.map(PaymentInfo::riskScore).orElse(null));
            row.put("fdsResult", info.map(PaymentInfo::fdsResult).orElse(null));
            row.put("ruleHits", info.map(PaymentInfo::ruleHits).orElse(List.of()));
            rows.add(row);
            maxScore = Math.max(maxScore, info.map(PaymentInfo::riskScore).orElse(0));
            // FDS 평가가 실패해 매입 보류된 결제 (#96 F-2)
            if ("ERROR".equals(info.map(PaymentInfo::fdsResult).orElse(null))) {
                failed++;
            }
            info.map(PaymentInfo::ruleHits).orElse(List.of()).stream()
                    .filter(rule -> !rules.contains(rule))
                    .forEach(rules::add);
        }
        String summary = "결제 " + rows.size() + "건 · 최고 " + maxScore + "점"
                + (failed == 0 ? "" : " · FDS 평가 실패 " + failed + "건")
                + (rules.isEmpty() ? "" : " · " + String.join(", ", rules));
        return new Answer(rows, summary);
    }

    private static Optional<List<Long>> paymentIdsArg(Object value) {
        if (!(value instanceof Collection<?> values)) {
            return Optional.empty();
        }
        List<Long> ids = new ArrayList<>();
        for (Object id : values) {
            try {
                ids.add(Long.valueOf(String.valueOf(id)));
            } catch (NumberFormatException e) {
                throw new ReportException(ReportErrorCode.PAYMENT_NOT_IN_CASE);
            }
        }
        return Optional.of(ids);
    }

    private static String won(long amount) {
        return NumberFormat.getNumberInstance(Locale.KOREA).format(amount) + "원";
    }
}
