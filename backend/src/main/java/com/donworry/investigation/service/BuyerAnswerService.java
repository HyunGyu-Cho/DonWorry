package com.donworry.investigation.service;

import com.donworry.investigation.entity.CaseHistory;
import com.donworry.investigation.entity.CaseHistoryEventType;
import com.donworry.investigation.entity.CasePayment;
import com.donworry.investigation.entity.SecurityCase;
import com.donworry.investigation.repository.CaseHistoryRepository;
import com.donworry.investigation.repository.CasePaymentRepository;
import com.donworry.investigation.repository.SecurityCaseRepository;
import com.donworry.investigation.service.InvestigationEvents.CaseEvidenceChanged;
import com.donworry.payment.api.BuyerConfirmed;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 구매자 답변 = 사건의 새 증거 (#82, 2-24 최소판) — 사건 기록에 남기고 증거 버전을 올려 AI가 다시 조사한다
// 조사 중이면 진행 중인 버전은 대체되고 바로 새 버전이 시작된다 (2-18 규칙 그대로)
@Slf4j
@Service
@RequiredArgsConstructor
public class BuyerAnswerService {

    private final CasePaymentRepository casePaymentRepository;
    private final SecurityCaseRepository securityCaseRepository;
    private final CaseHistoryRepository caseHistoryRepository;
    private final CaseStatusService caseStatusService;
    private final ApplicationEventPublisher events;

    // 결제 쪽 커밋 뒤에 부른다 — 끝난 트랜잭션에 합류하지 않게 새 트랜잭션
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(BuyerConfirmed answer) {
        Optional<CasePayment> casePayment = casePaymentRepository.findByPaymentId(answer.paymentId());
        if (casePayment.isEmpty()) {
            log.info("사건에 묶이지 않은 결제의 구매자 응답 paymentId={}", answer.paymentId());
            return;
        }
        SecurityCase securityCase = securityCaseRepository
                .findByIdForUpdate(casePayment.get().getSecurityCase().getId())
                .orElseThrow();
        Instant now = Instant.now();
        if (securityCase.isClosed()) {
            // 끝난 사건은 다시 열지 않는다 — 응답 사실만 남긴다
            caseHistoryRepository.save(CaseHistory.bySystem(
                    securityCase, CaseHistoryEventType.BUYER_RESPONDED, data(answer, securityCase), now));
            return;
        }
        securityCase.increaseEvidenceVersion();
        caseHistoryRepository.save(CaseHistory.bySystem(
                securityCase, CaseHistoryEventType.BUYER_RESPONDED, data(answer, securityCase), now));
        caseStatusService.refresh(securityCase, now);
        events.publishEvent(new CaseEvidenceChanged(securityCase.getId(), securityCase.getEvidenceVersion()));
    }

    private static Map<String, Object> data(BuyerConfirmed answer, SecurityCase securityCase) {
        return Map.of(
                "paymentId", answer.paymentId(),
                "answer", answer.answer(),
                "evidenceVersion", securityCase.getEvidenceVersion());
    }
}
