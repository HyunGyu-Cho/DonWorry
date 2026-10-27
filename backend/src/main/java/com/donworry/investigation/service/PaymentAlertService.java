package com.donworry.investigation.service;

import com.donworry.fds.api.FdsEvaluationDetail;
import com.donworry.fds.api.FdsEvaluationPage;
import com.donworry.fds.api.FdsEvaluationSummary;
import com.donworry.fds.api.FdsPaymentEvaluations;
import com.donworry.fds.api.FdsResult;
import com.donworry.investigation.dto.InvestigationViewDtos.PaymentAlertDetail;
import com.donworry.investigation.dto.InvestigationViewDtos.PaymentAlertPage;
import com.donworry.investigation.dto.InvestigationViewDtos.PaymentAlertSummary;
import com.donworry.investigation.repository.CasePaymentRepository;
import com.donworry.investigation.service.PaymentInfoReader.PaymentInfo;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 결제 경보 화면 (#82) — P2 평가에 P5 결제(금액 · 주문 · 고객 이름)와 P3 사건 번호를 붙인다
// fds는 결제 · 사건 모듈을 모르므로(ADR-0012) 합치는 조회는 위층인 investigation에 둔다 (AGENTS 4절)
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PaymentAlertService {

    private final FdsPaymentEvaluations fdsPaymentEvaluations;
    private final PaymentInfoReader paymentInfoReader;
    private final CasePaymentRepository casePaymentRepository;

    public PaymentAlertPage list(FdsResult result, boolean attentionOnly, String search, int page, int size) {
        FdsEvaluationPage evaluations = fdsPaymentEvaluations.list(result, attentionOnly, search, page, size);
        Map<String, Long> counts = new LinkedHashMap<>();
        evaluations.resultCounts().forEach((key, value) -> counts.put(key.name(), value));
        return new PaymentAlertPage(
                evaluations.content().stream().map(this::summary).toList(),
                evaluations.page(),
                evaluations.size(),
                evaluations.totalElements(),
                evaluations.totalPages(),
                counts);
    }

    public Optional<PaymentAlertDetail> detail(Long evaluationId) {
        return fdsPaymentEvaluations.find(evaluationId).map(this::detail);
    }

    private PaymentAlertDetail detail(FdsEvaluationDetail detail) {
        return new PaymentAlertDetail(
                summary(detail.evaluation()),
                detail.ruleHits(),
                detail.history().stream().map(this::summary).toList());
    }

    private PaymentAlertSummary summary(FdsEvaluationSummary evaluation) {
        Optional<PaymentInfo> payment = paymentInfoReader.find(evaluation.paymentId());
        String caseId = casePaymentRepository
                .findByPaymentId(evaluation.paymentId())
                .map(casePayment -> String.valueOf(casePayment.getSecurityCase().getId()))
                .orElse(null);
        return new PaymentAlertSummary(
                evaluation.evaluationId(),
                evaluation.paymentId(),
                evaluation.customerRef(),
                evaluation.riskScore(),
                evaluation.result().name(),
                evaluation.evaluatedAt(),
                evaluation.errorCode(),
                evaluation.paymentRequestedAt(),
                payment.map(PaymentInfo::amount).orElse(null),
                payment.map(PaymentInfo::orderTitle).orElse(null),
                CaseLabels.customer(payment),
                fdsPaymentEvaluations.matchedRuleCodes(evaluation.evaluationId()),
                caseId);
    }
}
