package com.donworry.fds.repository;

import com.donworry.fds.entity.FdsRule;
import java.util.List;
import org.springframework.data.repository.Repository;

public interface FdsRuleRepository extends Repository<FdsRule, Long> {

    List<FdsRule> findAllByOrderByRuleIdAsc();
}
