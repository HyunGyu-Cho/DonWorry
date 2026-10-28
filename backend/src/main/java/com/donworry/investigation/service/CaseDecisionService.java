package com.donworry.investigation.service;

import com.donworry.identity.api.Reauthentication;
import com.donworry.investigation.dto.DecisionSubmitRequest;
import com.donworry.investigation.entity.ActionHandoff;
import com.donworry.investigation.entity.ApprovalRequest;
import com.donworry.investigation.entity.CaseHistory;
import com.donworry.investigation.entity.CaseHistoryEventType;
import com.donworry.investigation.entity.CasePayment;
import com.donworry.investigation.entity.Decision;
import com.donworry.investigation.entity.PaymentDecision;
import com.donworry.investigation.entity.SecurityCase;
import com.donworry.investigation.repository.ActionHandoffRepository;
import com.donworry.investigation.repository.CaseHistoryRepository;
import com.donworry.investigation.repository.CasePaymentRepository;
import com.donworry.investigation.repository.PaymentDecisionRepository;
import com.donworry.investigation.repository.SecurityCaseRepository;
import com.donworry.investigation.service.InvestigationEvents.HandoffRequested;
import com.donworry.investigation.service.ReportGateway.ReportSnapshot;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 직원 결제별 판정과 금융 조치 인계 요청을 같은 트랜잭션에 저장한다 (fds 정본 02 §2.8 · §2.9)
// 판정자는 로그인한 직원, AI 권고와 반대인 판정은 재인증 뒤 보안 관리자 승인을 거쳐 반영한다 (#102, ADR-0024)
@Service
@RequiredArgsConstructor
public class CaseDecisionService {

    static final String REJECT_REVIEW = "REJECT_REVIEW";
    static final String OVERRIDE_TARGET = "PAYMENT_DECISION";

    private final SecurityCaseRepository securityCaseRepository;
    private final CasePaymentRepository casePaymentRepository;
    private final PaymentDecisionRepository paymentDecisionRepository;
    private final ActionHandoffRepository actionHandoffRepository;
    private final CaseHistoryRepository caseHistoryRepository;
    private final CaseStatusService caseStatusService;
    private final ReportGateway reportGateway;
    private final ApplicationEventPublisher events;
    private final StaffGuard staffGuard;
    private final Reauthentication reauthentication;
    private final ApprovalCommandService approvalCommandService;
    private final AuditTrail auditTrail;

    // DECIDED = 바로 반영, APPROVAL_PENDING = 관리자 승인 대기 (approvalId)
    public record Outcome(String outcome, Long approvalId) {
        static final Outcome DECIDED = new Outcome("DECIDED", null);
    }

    record Planned(CasePayment casePayment, DecisionSubmitRequest.Item item) {}

    // P5 호출은 커밋 뒤 HandoffRequested 리스너가 한다 — 판정 저장이 롤백되면 인계 요청도 나가지 않는다
    @Transactional
    public Outcome decide(Long caseId, DecisionSubmitRequest request) {
        var staff = staffGuard.requireStaff();
        // 병합과 같은 Case 행 잠금 — 판정 중에 결제가 끼어들어 증거 버전이 바뀌지 않게 한다
        SecurityCase securityCase = lockOpenCase(caseId);
        if (request.evidenceVersion() != securityCase.getEvidenceVersion()) {
            throw new InvestigationException(InvestigationErrorCode.EVIDENCE_VERSION_CONFLICT);
        }
        Optional<ReportSnapshot> report = validateReport(caseId, securityCase.getEvidenceVersion(), request.reportId());
        Instant now = Instant.now();
        // 승인을 기다리는 판정이 있으면 그 결과가 나올 때까지 다른 판정을 받지 않는다
        if (caseStatusService.overridePending(caseId, now)) {
            throw new InvestigationException(InvestigationErrorCode.APPROVAL_DUPLICATE);
        }
        List<Planned> planned = plan(caseId, request.decisions());

        List<Planned> opposite = request.reportId() == null ? List.of() : opposite(planned, report.orElseThrow());
        if (!opposite.isEmpty()) {
            if (!reauthentication.consume(request.reauthToken())) {
                throw new InvestigationException(InvestigationErrorCode.REAUTH_REQUIRED);
            }
            ApprovalRequest approval = requestOverride(securityCase, request, planned, opposite, staff.userId());
            caseStatusService.refresh(securityCase, now);
            return new Outcome("APPROVAL_PENDING", approval.getId());
        }
        apply(securityCase, planned, staff.userId(), request.reportId(), now);
        auditTrail.staff(staff.userId(), "DECISION_CONFIRMED", "SECURITY_CASE", caseId, decisionDetail(planned, null));
        caseStatusService.refresh(securityCase, now);
        return Outcome.DECIDED;
    }

    // 관리자가 승인 · 거절하면 같은 트랜잭션에서 사건에 반영한다. 승인은 요청한 직원 이름으로 판정한다
    @EventListener
    void on(ApprovalCommandService.OverrideDecided event) {
        ApprovalRequest approval = event.request();
        Map<String, Object> payload = approval.getPayload();
        Long caseId = Long.valueOf(String.valueOf(payload.get("caseId")));
        SecurityCase securityCase = lockOpenCase(caseId);
        Instant now = Instant.now();
        Map<String, Object> history = new HashMap<>();
        history.put("to", event.approved() ? "APPROVED" : "REJECTED");
        history.put("approvalId", approval.getId());
        if (approval.getDecisionComment() != null) {
            history.put("comment", approval.getDecisionComment());
        }
        caseHistoryRepository.save(CaseHistory.byStaff(
                securityCase, CaseHistoryEventType.CASE_STATUS_CHANGED, approval.getDecidedBy(), history, now));
        if (event.approved()) {
            // 요청 뒤 사건에 결제가 더 붙었으면 다시 판정해야 한다 → 승인하지 말고 거절해야 함
            int evidenceVersion = Integer.parseInt(String.valueOf(payload.get("evidenceVersion")));
            if (evidenceVersion != securityCase.getEvidenceVersion()) {
                throw new InvestigationException(InvestigationErrorCode.EVIDENCE_VERSION_CONFLICT);
            }
            List<Planned> planned = plan(caseId, items(payload.get("decisions")));
            Object reportId = payload.get("reportId");
            Long requester = approval.getRequestedBy();
            apply(
                    securityCase,
                    planned,
                    requester,
                    reportId == null ? null : Long.valueOf(String.valueOf(reportId)),
                    now);
            auditTrail.staff(
                    requester,
                    "DECISION_CONFIRMED",
                    "SECURITY_CASE",
                    caseId,
                    decisionDetail(planned, approval.getId()));
        }
        caseStatusService.refresh(securityCase, now);
    }

    private SecurityCase lockOpenCase(Long caseId) {
        SecurityCase securityCase = securityCaseRepository
                .findByIdForUpdate(caseId)
                .orElseThrow(() -> new InvestigationException(InvestigationErrorCode.CASE_NOT_FOUND));
        if (securityCase.isClosed()) {
            throw new InvestigationException(InvestigationErrorCode.CASE_CLOSED);
        }
        return securityCase;
    }

    // 이 사건 결제인지 · 한 요청에 두 번인지 · 이미 판정했는지
    private List<Planned> plan(Long caseId, List<DecisionSubmitRequest.Item> items) {
        Map<Long, CasePayment> payments = casePaymentRepository.findBySecurityCaseIdOrderByLinkedAtAsc(caseId).stream()
                .collect(Collectors.toMap(CasePayment::getId, Function.identity()));
        Set<Long> decided = paymentDecisionRepository.findByCasePaymentSecurityCaseId(caseId).stream()
                .map(decision -> decision.getCasePayment().getId())
                .collect(Collectors.toSet());
        Set<Long> inRequest = new HashSet<>();
        List<Planned> planned = new ArrayList<>();
        for (DecisionSubmitRequest.Item item : items) {
            CasePayment casePayment = payments.get(item.casePaymentId());
            if (casePayment == null) {
                throw new InvestigationException(InvestigationErrorCode.PAYMENT_NOT_IN_CASE);
            }
            if (!inRequest.add(item.casePaymentId())) {
                throw new InvestigationException(InvestigationErrorCode.DUPLICATE_PAYMENT_IN_REQUEST);
            }
            if (decided.contains(item.casePaymentId())) {
                throw new InvestigationException(InvestigationErrorCode.PAYMENT_ALREADY_DECIDED);
            }
            planned.add(new Planned(casePayment, item));
        }
        return planned;
    }

    // AI가 "승인 취소 검토"를 권했는데 매입 허용으로 판정한 결제 (화면 DecisionPanel과 같은 기준)
    private static List<Planned> opposite(List<Planned> planned, ReportSnapshot report) {
        Map<String, String> recommendations = recommendations(report.reportBody());
        return planned.stream()
                .filter(p -> p.item().decision() == Decision.ACCEPT)
                .filter(p -> REJECT_REVIEW.equals(
                        recommendations.get(String.valueOf(p.casePayment().getPaymentId()))))
                .toList();
    }

    // 결제 번호(문자) → 권고. 결론 카드 형식(paymentRecommendations)과 옛 형식(paymentAnalyses) 모두 읽는다
    static Map<String, String> recommendations(Map<String, Object> body) {
        Map<String, String> result = new HashMap<>();
        if (body == null) {
            return result;
        }
        for (String key : List.of("paymentAnalyses", "paymentRecommendations")) {
            if (body.get(key) instanceof Collection<?> rows) {
                for (Object row : rows) {
                    if (row instanceof Map<?, ?> map && map.get("paymentId") != null) {
                        result.put(String.valueOf(map.get("paymentId")), String.valueOf(map.get("recommendation")));
                    }
                }
            }
        }
        return result;
    }

    // 승인되면 그대로 반영할 판정 묶음 전체를 담는다. 화면이 같은 모양(문자 ID)으로 읽는다
    private ApprovalRequest requestOverride(
            SecurityCase securityCase,
            DecisionSubmitRequest request,
            List<Planned> planned,
            List<Planned> opposite,
            Long staffId) {
        List<Map<String, Object>> decisions = planned.stream()
                .map(p -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("casePaymentId", String.valueOf(p.casePayment().getId()));
                    row.put("decision", p.item().decision().name());
                    row.put("reason", p.item().reason());
                    return row;
                })
                .toList();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("caseId", String.valueOf(securityCase.getId()));
        payload.put("evidenceVersion", securityCase.getEvidenceVersion());
        payload.put("reportId", String.valueOf(request.reportId()));
        payload.put("decisions", decisions);
        payload.put("reauthenticated", true);
        String reason = opposite.stream().map(p -> p.item().reason()).collect(Collectors.joining(" / "));
        return approvalCommandService.open(
                ApprovalCommandService.DECISION_OVERRIDE,
                OVERRIDE_TARGET,
                opposite.getFirst().casePayment().getId(),
                "사건 " + securityCase.getId() + " · 권고 반대 판정 " + planned.size() + "건",
                payload,
                reason.length() > 500 ? reason.substring(0, 500) : reason,
                staffId);
    }

    private void apply(SecurityCase securityCase, List<Planned> planned, Long staffId, Long reportId, Instant now) {
        for (Planned p : planned) {
            PaymentDecision decision = paymentDecisionRepository.save(PaymentDecision.confirm(
                    p.casePayment(),
                    staffId,
                    reportId,
                    p.item().decision(),
                    p.item().reason(),
                    securityCase.getEvidenceVersion(),
                    now));
            ActionHandoff handoff = actionHandoffRepository.save(ActionHandoff.request(decision, now));
            caseHistoryRepository.save(CaseHistory.byStaff(
                    securityCase,
                    CaseHistoryEventType.DECISION_CONFIRMED,
                    staffId,
                    Map.of(
                            "decisionId", decision.getId(),
                            "casePaymentId", p.casePayment().getId(),
                            "decision", p.item().decision().name()),
                    now));
            caseHistoryRepository.save(CaseHistory.byStaff(
                    securityCase,
                    CaseHistoryEventType.HANDOFF_REQUESTED,
                    staffId,
                    Map.of(
                            "handoffId", handoff.getId(),
                            "decisionId", decision.getId(),
                            "actionType", handoff.getActionType().name()),
                    now));
            events.publishEvent(new HandoffRequested(handoff.getId()));
        }
    }

    private static List<DecisionSubmitRequest.Item> items(Object raw) {
        List<DecisionSubmitRequest.Item> items = new ArrayList<>();
        if (raw instanceof Collection<?> rows) {
            for (Object row : rows) {
                Map<?, ?> map = (Map<?, ?>) row;
                items.add(new DecisionSubmitRequest.Item(
                        Long.valueOf(String.valueOf(map.get("casePaymentId"))),
                        Decision.valueOf(String.valueOf(map.get("decision"))),
                        String.valueOf(map.get("reason"))));
            }
        }
        return items;
    }

    private static Map<String, Object> decisionDetail(List<Planned> planned, Long approvalId) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put(
                "decisions",
                planned.stream()
                        .map(p -> p.casePayment().getId() + ":"
                                + p.item().decision().name())
                        .toList());
        if (approvalId != null) {
            detail.put("approvalId", approvalId);
        }
        return detail;
    }

    // 보고서를 참고했으면 최신 · 성공 · 같은 증거 버전이어야 한다. 보고서 없이 판정은 최종 실패 뒤에만 허용한다
    private Optional<ReportSnapshot> validateReport(Long caseId, int evidenceVersion, Long reportId) {
        Optional<ReportSnapshot> latest = reportGateway.latest(caseId);
        boolean sameVersion = latest.map(report -> report.evidenceVersion() == evidenceVersion)
                .orElse(false);
        if (reportId == null) {
            if (!(sameVersion && latest.get().isFailed())) {
                throw new InvestigationException(InvestigationErrorCode.MANUAL_DECISION_NOT_ALLOWED);
            }
            return latest;
        }
        if (!(sameVersion
                && latest.get().isSucceeded()
                && reportId.equals(latest.get().reportId()))) {
            throw new InvestigationException(InvestigationErrorCode.REPORT_NOT_LATEST);
        }
        return latest;
    }
}
