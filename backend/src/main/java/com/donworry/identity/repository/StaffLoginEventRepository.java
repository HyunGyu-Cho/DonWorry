package com.donworry.identity.repository;

import com.donworry.identity.entity.StaffLoginEvent;
import java.util.List;
import org.springframework.data.repository.Repository;

// 로그인 기록은 쌓기만 한다 (수정 · 삭제 메서드 없음)
public interface StaffLoginEventRepository extends Repository<StaffLoginEvent, Long> {

    StaffLoginEvent save(StaffLoginEvent event);

    List<StaffLoginEvent> findByLoginIdAttemptedOrderByLoginEventIdAsc(String loginIdAttempted);
}
