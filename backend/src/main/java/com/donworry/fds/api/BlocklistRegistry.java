package com.donworry.fds.api;

// 차단 목록에 값을 올리는 공개 경계 (#100 F-10) — 결제 경보에서 고른 값을 investigation이 넘긴다
// entryType: CARD(카드 지문) · DEVICE · IP · EMAIL. 같은 종류 · 같은 값이 이미 활성이면 새로 만들지 않는다 (고객사 공통)
public interface BlocklistRegistry {

    Registered register(NewEntry entry);

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
