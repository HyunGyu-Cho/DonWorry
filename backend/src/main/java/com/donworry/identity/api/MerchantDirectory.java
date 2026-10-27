package com.donworry.identity.api;

import java.util.Optional;

// 가맹점 이름 · 코드를 읽는 공개 경계 (#82) — 결제창이 "어느 가게 결제인지" 보여 줄 때
public interface MerchantDirectory {

    Optional<MerchantView> find(Long merchantId);

    Optional<MerchantView> findByCode(String merchantCode);

    record MerchantView(Long merchantId, String merchantCode, String displayName) {}
}
