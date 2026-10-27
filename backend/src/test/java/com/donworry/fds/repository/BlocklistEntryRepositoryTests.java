package com.donworry.fds.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.donworry.MariaDbTestContainerConfig;
import com.donworry.fds.entity.BlocklistEntry;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

// 실제 MariaDB에서 평가 전 차단 대조가 해제 · 만료된 항목을 빼는지 (#100 F-10)
@Tag("mariadb")
@SpringBootTest
@Import(MariaDbTestContainerConfig.class)
@Transactional
class BlocklistEntryRepositoryTests {

    @Autowired
    BlocklistEntryRepository repository;

    @Test
    void R07_해제만료된항목_대조안함() {
        Instant now = Instant.now();
        String active = "dev-active-" + UUID.randomUUID();
        String released = "dev-released-" + UUID.randomUUID();
        String expired = "dev-expired-" + UUID.randomUUID();
        Long activeId = repository.save(entry(active, now)).getEntryId();
        var releasedEntry = entry(released, now);
        org.springframework.test.util.ReflectionTestUtils.setField(releasedEntry, "releasedAt", now.minusSeconds(1));
        repository.save(releasedEntry);
        var expiredEntry = entry(expired, now);
        org.springframework.test.util.ReflectionTestUtils.setField(expiredEntry, "expiresAt", now.minusSeconds(60));
        repository.save(expiredEntry);

        assertThat(repository.findActiveMatches(null, active, null, null, now))
                .extracting(BlocklistEntry::getEntryId)
                .containsExactly(activeId);
        assertThat(repository.findActiveMatches(null, released, null, null, now))
                .isEmpty();
        assertThat(repository.findActiveMatches(null, expired, null, null, now)).isEmpty();
        // 같은 값이라도 종류가 다르면 일치가 아니다 (기기 값을 IP로 넣어도 안 걸림)
        assertThat(repository.findActiveMatches(null, null, active, null, now)).isEmpty();
    }

    private static BlocklistEntry entry(String device, Instant now) {
        return BlocklistEntry.create("DEVICE", device, device, "테스트 #100", "STAFF", null, 4L, now);
    }
}
