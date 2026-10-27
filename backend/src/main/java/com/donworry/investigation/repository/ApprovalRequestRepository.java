package com.donworry.investigation.repository;

import com.donworry.investigation.entity.ApprovalRequest;
import java.util.List;
import org.springframework.data.repository.Repository;

public interface ApprovalRequestRepository extends Repository<ApprovalRequest, Long> {

    List<ApprovalRequest> findAllByOrderByRequestedAtDesc();

    List<ApprovalRequest> findByStatusOrderByRequestedAtDesc(String status);
}
