package com.donworry.fds.api;

import java.time.Duration;

// 시간 창 Rule이 세는 기간 (#98 F-8) — 기준값의 정본은 P2 fds_rules, P5가 자기 결제 기록을 셀 때 읽는다
// customerAttempts: R04 같은 고객 결제 시도 · cardDeclines: R08 같은 카드 거절 · ipCards: R06 같은 IP 카드 수
public interface FdsCountWindows {

    Windows current();

    record Windows(Duration customerAttempts, Duration cardDeclines, Duration ipCards) {}
}
