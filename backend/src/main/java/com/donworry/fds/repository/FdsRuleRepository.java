package com.donworry.fds.repository;

import com.donworry.fds.entity.FdsRule;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

public interface FdsRuleRepository extends Repository<FdsRule, Long> {

    // 폐지하지 않은 Rule — 결제 Rule은 표시 번호(R01~R08) 순, 그 뒤 직원 Rule은 rule_id 순 (#96)
    @Query("""
            select r from FdsRule r
            where r.retiredAt is null
            order by case when r.displayCode is null then 1 else 0 end, r.displayCode, r.ruleId
            """)
    List<FdsRule> findActiveCatalog();
}
