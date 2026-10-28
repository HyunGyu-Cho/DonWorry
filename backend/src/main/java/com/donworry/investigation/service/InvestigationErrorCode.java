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
    // 관리자 승인 · 재인증 (#102) — 화면 계약(types · api)에 미리 정한 번호
    SELF_APPROVAL("INV_010", "본인이 요청한 건은 승인할 수 없습니다. 다른 보안 관리자가 처리해야 합니다.", HttpStatus.FORBIDDEN),
    STAFF_ONLY("INV_011", "보안 직원 · 보안 관리자만 할 수 있습니다.", HttpStatus.FORBIDDEN),
    APPROVAL_CLOSED("INV_012", "이미 처리됐거나 기한이 지난 승인 요청입니다.", HttpStatus.CONFLICT),
    APPROVAL_DUPLICATE("INV_013", "같은 대상에 처리 대기 중인 승인 요청이 이미 있습니다.", HttpStatus.CONFLICT),
    REJECT_REASON_REQUIRED("INV_015", "거절할 때는 이유를 적어 주세요.", HttpStatus.BAD_REQUEST),
    MANAGER_ONLY("INV_016", "승인 · 거절은 보안 관리자만 할 수 있습니다.", HttpStatus.FORBIDDEN),
    REAUTH_REQUIRED("INV_017", "AI 권고와 반대인 판정은 비밀번호를 다시 확인해야 합니다.", HttpStatus.FORBIDDEN),
    // 차단 목록 등록 (#100) — 화면 Mock이 쓰는 INV_010~017 다음 번호
    BLOCK_FORBIDDEN("INV_018", "보안 직원 · 보안 관리자만 차단 목록에 등록할 수 있습니다.", HttpStatus.FORBIDDEN),
    ALERT_NOT_FOUND("INV_019", "결제 경보가 없습니다.", HttpStatus.NOT_FOUND),
    BLOCK_VALUE_MISSING("INV_020", "이 결제에는 고른 값이 없어 차단할 수 없습니다.", HttpStatus.BAD_REQUEST),
    LOGIN_REQUIRED("INV_021", "로그인이 필요합니다.", HttpStatus.UNAUTHORIZED),
    APPROVAL_NOT_FOUND("INV_022", "승인 요청이 없습니다.", HttpStatus.NOT_FOUND),
    INVALID_APPROVAL_REQUEST("INV_023", "직접 만들 수 없는 승인 요청입니다.", HttpStatus.BAD_REQUEST),
    AUDIT_MANAGER_ONLY("INV_024", "감사 로그는 보안 관리자만 볼 수 있습니다.", HttpStatus.FORBIDDEN),
    // Rule 끄기 · 차단 해제 요청 대상 확인 (#104 2-7) — 없는 대상 · 끌 수 없는 Rule · 이미 꺼진 Rule · 이미 풀린 차단
    APPROVAL_TARGET_INVALID("INV_025", "요청할 수 없는 대상입니다. 이미 꺼졌거나 풀렸는지 화면을 새로 고쳐 확인해 주세요.", HttpStatus.CONFLICT);

    private final String code;
    private final String message;
    private final HttpStatus status;
}
