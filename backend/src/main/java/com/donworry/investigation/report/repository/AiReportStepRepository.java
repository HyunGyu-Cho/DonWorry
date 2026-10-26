package com.donworry.investigation.report.repository;

import com.donworry.investigation.report.entity.AiReportStep;
import java.util.List;
import org.springframework.data.repository.Repository;

// 조사 과정 기록은 쌓기만 한다 — 수정 · 삭제를 노출하지 않는다
public interface AiReportStepRepository extends Repository<AiReportStep, Long> {

    AiReportStep save(AiReportStep step);

    int countByReportId(Long reportId);

    List<AiReportStep> findByReportIdAndAttemptIdOrderByStepNoAsc(Long reportId, String attemptId);
}
