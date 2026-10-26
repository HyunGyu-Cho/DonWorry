package com.donworry.investigation.report.repository;

import com.donworry.investigation.report.entity.AiReportStep;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;

// 조사 과정 기록은 쌓기만 한다 — 수정 · 삭제를 노출하지 않는다
public interface AiReportStepRepository extends Repository<AiReportStep, Long> {

    AiReportStep save(AiReportStep step);

    int countByReportId(Long reportId);

    // 한 보고서의 모든 시도 기록 — 다시 시도한 과정도 화면에 남긴다 (2-19b)
    List<AiReportStep> findByReportIdOrderByStepNoAsc(Long reportId);

    boolean existsByReportIdAndKindIn(Long reportId, Collection<String> kinds);
}
