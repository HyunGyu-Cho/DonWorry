package com.donworry.investigation.service;

import com.donworry.fds.api.BlocklistRegistry;
import com.donworry.fds.api.FdsPaymentEvaluations;
import com.donworry.identity.api.CurrentUser;
import com.donworry.investigation.dto.BlocklistDtos.BlockRequest;
import com.donworry.investigation.dto.BlocklistDtos.BlockedEntry;
import com.donworry.payment.api.PaymentLookup;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 결제 경보에서 고른 값을 차단 목록에 올린다 (#100 F-10)
// 카드는 화면에 끝자리만 있어서 결제 번호로 카드 지문을 찾는다 — P2는 결제를 못 읽어 위층(investigation)이 잇는다 (AGENTS 4절)
@Service
@RequiredArgsConstructor
public class PaymentAlertBlockService {

    static final Set<String> STAFF_ROLES = Set.of("SECURITY_STAFF", "SECURITY_MANAGER");
    static final List<String> ORDER = List.of("CARD", "DEVICE", "IP", "EMAIL");

    private final CurrentUser currentUser;
    private final FdsPaymentEvaluations fdsPaymentEvaluations;
    private final PaymentLookup paymentLookup;
    private final BlocklistRegistry blocklistRegistry;
    private final AuditTrail auditTrail;

    @Transactional
    public List<BlockedEntry> block(Long evaluationId, BlockRequest request) {
        var user = currentUser
                .get()
                .filter(u -> STAFF_ROLES.contains(u.role()))
                .orElseThrow(() -> new InvestigationException(InvestigationErrorCode.BLOCK_FORBIDDEN));
        var evaluation = fdsPaymentEvaluations
                .find(evaluationId)
                .orElseThrow(() -> new InvestigationException(InvestigationErrorCode.ALERT_NOT_FOUND));
        var values = paymentLookup
                .blockValues(evaluation.evaluation().paymentId())
                .orElseThrow(() -> new InvestigationException(InvestigationErrorCode.ALERT_NOT_FOUND));
        Set<String> types = new LinkedHashSet<>();
        ORDER.stream().filter(request.types()::contains).forEach(types::add);
        if (types.size() != new LinkedHashSet<>(request.types()).size()) {
            throw new IllegalArgumentException("unknown block type");
        }
        List<BlockedEntry> result = new ArrayList<>();
        for (String type : types) {
            String[] value = valueOf(type, values);
            if (value[0] == null || value[0].isBlank()) {
                throw new InvestigationException(InvestigationErrorCode.BLOCK_VALUE_MISSING);
            }
            var registered = blocklistRegistry.register(new BlocklistRegistry.NewEntry(
                    type, value[0], value[1], request.reason().trim(), "STAFF", null, user.userId()));
            result.add(new BlockedEntry(
                    registered.entryId(), registered.entryType(), registered.displayValue(), !registered.created()));
            if (registered.created()) {
                auditTrail.staff(
                        user.userId(),
                        "BLOCKLIST_ADDED",
                        "BLOCKLIST_ENTRY",
                        registered.entryId(),
                        Map.of("entryType", registered.entryType(), "evaluationId", evaluationId));
            }
        }
        return result;
    }

    // [차단 대조 값, 화면 값] — 카드는 지문 · 끝자리, 나머지는 같은 값
    private static String[] valueOf(String type, PaymentLookup.BlockValues values) {
        return switch (type) {
            case "CARD" ->
                new String[] {
                    values.cardFingerprint(), values.cardLast4() == null ? "**** (카드)" : "**** " + values.cardLast4()
                };
            case "DEVICE" -> new String[] {values.deviceId(), values.deviceId()};
            case "IP" -> new String[] {values.clientIp(), values.clientIp()};
            default -> new String[] {values.buyerEmail(), values.buyerEmail()};
        };
    }
}
