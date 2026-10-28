package com.donworry.identity.api;

// 위험한 조치 직전 재인증 표 확인 (#102) — 비밀번호를 다시 넣고 받은 표, 5분 · 1회용
// 지금 로그인한 직원 세션에서 받은 표만 통과하고, 확인하면 표는 사라진다
public interface Reauthentication {

    boolean consume(String reauthToken);
}
