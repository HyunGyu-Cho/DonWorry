package com.donworry.fds.repository;

import com.donworry.fds.entity.BlocklistEntry;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface BlocklistEntryRepository extends Repository<BlocklistEntry, Long> {

    List<BlocklistEntry> findAllByOrderByCreatedAtDesc();

    BlocklistEntry save(BlocklistEntry entry);

    // 평가 전 대조 (#100): 카드 지문 · 기기 · IP · 이메일 중 하나라도 같은 활성 항목. 해제 · 만료된 항목은 빼고, 오래된 항목 먼저
    @Query("""
            select e from BlocklistEntry e
            where e.releasedAt is null and (e.expiresAt is null or e.expiresAt > :now)
              and ((e.entryType = 'CARD' and e.entryValue = :card)
                or (e.entryType = 'DEVICE' and e.entryValue = :device)
                or (e.entryType = 'IP' and e.entryValue = :ip)
                or (e.entryType = 'EMAIL' and e.entryValue = :email))
            order by e.entryId
            """)
    List<BlocklistEntry> findActiveMatches(
            @Param("card") String card,
            @Param("device") String device,
            @Param("ip") String ip,
            @Param("email") String email,
            @Param("now") Instant now);

    List<BlocklistEntry> findByEntryTypeAndEntryValue(String entryType, String entryValue);
}
