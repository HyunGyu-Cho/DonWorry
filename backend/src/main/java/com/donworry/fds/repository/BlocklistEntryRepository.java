package com.donworry.fds.repository;

import com.donworry.fds.entity.BlocklistEntry;
import java.util.List;
import org.springframework.data.repository.Repository;

public interface BlocklistEntryRepository extends Repository<BlocklistEntry, Long> {

    List<BlocklistEntry> findAllByOrderByCreatedAtDesc();
}
