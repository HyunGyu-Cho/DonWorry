package com.donworry.fds.api;

// 차단 목록에 값을 올리고 푸는 공개 경계 (#100 F-10 · #104 2-7) — 결제 경보 · 관리자 승인에서 investigation이 부른다
// entryType: CARD(카드 지문) · DEVICE · IP · EMAIL. 같은 종류 · 같은 값이 이미 활성이면 새로 만들지 않는다 (고객사 공통)
public interface BlocklistRegistry {

    Registered register(NewEntry entry);

    // 해제 요청을 받기 전 대상 확인 (#104 2-7)
    EntryState state(Long entryId);

    // 관리자 승인 뒤 해제 — 승인한 관리자가 released_by. 이미 풀렸거나 만료됐으면 바꾸지 않는다
    TargetChange release(Long entryId, Long approvedBy);

    // INACTIVE = 이미 해제됐거나 기한이 지남
    enum EntryState {
        MISSING,
        ACTIVE,
        INACTIVE
    }

    // source: STAFF(직원 직접) · CASE(사건 판정). displayValue는 화면에 보일 값 (카드는 **** 1173)
    record NewEntry(
            String entryType,
            String entryValue,
            String displayValue,
            String reason,
            String source,
            Long sourceRef,
            Long createdBy) {}

    // created=false면 이미 차단돼 있던 항목
    record Registered(Long entryId, String entryType, String displayValue, boolean created) {}
}
