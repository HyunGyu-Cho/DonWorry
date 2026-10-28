package com.donworry.fds.repository;

import com.donworry.fds.entity.FdsRule;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface FdsRuleRepository extends Repository<FdsRule, Long> {

    // 폐지하지 않은 Rule — 결제 Rule은 표시 번호(R01~R08) 순, 그 뒤 직원 Rule은 rule_id 순 (#96)
    @Query("""
            select r from FdsRule r
            where r.retiredAt is null
            order by case when r.displayCode is null then 1 else 0 end, r.displayCode, r.ruleId
            """)
    List<FdsRule> findActiveCatalog();

    Optional<FdsRule> findById(Long ruleId);

    // 켜기 · 끄기가 동시에 들어와도 한 번에 하나씩 (#104 2-7)
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from FdsRule r where r.ruleId = :ruleId")
    Optional<FdsRule> findByIdForUpdate(@Param("ruleId") Long ruleId);
}
