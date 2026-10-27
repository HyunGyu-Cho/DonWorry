package com.donworry.investigation.service;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

// 공통 ErrorCode 위치가 정해지기 전까지 모듈 안에 둔다 (02-code 3절 보류)
@Getter
@RequiredArgsConstructor
public enum InvestigationErrorCode {
    CASE_NOT_FOUND("INV_001", "Case가 없습니다.", HttpStatus.NOT_FOUND),
    CASE_CLOSED("INV_002", "이미 종료된 Case입니다.", HttpStatus.CONFLICT),
    EVIDENCE_VERSION_CONFLICT("INV_003", "Case에 새 결제가 추가됐습니다. 최신 내용을 확인한 뒤 다시 판정해 주세요.", HttpStatus.CONFLICT),
    REPORT_NOT_LATEST("INV_004", "최신 AI 보고서가 아닙니다. 최신 보고서를 확인한 뒤 다시 판정해 주세요.", HttpStatus.CONFLICT),
    MANUAL_DECISION_NOT_ALLOWED("INV_005", "AI 보고서가 최종 실패한 경우에만 보고서 없이 판정할 수 있습니다.", HttpStatus.BAD_REQUEST),
    PAYMENT_NOT_IN_CASE("INV_006", "이 Case에 속한 결제가 아닙니다.", HttpStatus.BAD_REQUEST),
    PAYMENT_ALREADY_DECIDED("INV_007", "이미 판정한 결제입니다.", HttpStatus.CONFLICT),
    DUPLICATE_PAYMENT_IN_REQUEST("INV_008", "같은 결제를 한 요청에서 두 번 판정할 수 없습니다.", HttpStatus.BAD_REQUEST),
    // 차단 목록 등록 (#100) — 화면 Mock이 쓰는 INV_010~017 다음 번호
    BLOCK_FORBIDDEN("INV_018", "보안 직원 · 보안 관리자만 차단 목록에 등록할 수 있습니다.", HttpStatus.FORBIDDEN),
    ALERT_NOT_FOUND("INV_019", "결제 경보가 없습니다.", HttpStatus.NOT_FOUND),
    BLOCK_VALUE_MISSING("INV_020", "이 결제에는 고른 값이 없어 차단할 수 없습니다.", HttpStatus.BAD_REQUEST);

    private final String code;
    private final String message;
    private final HttpStatus status;
}
