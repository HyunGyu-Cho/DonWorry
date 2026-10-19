package com.donworry;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import javax.sql.DataSource;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 06-3 필수 CI: 빈 MariaDB 에 Flyway 전체 migration 을 적용하고 JPA validate 로 기동한다.
 *
 * <p>실제 MariaDB 가 필요하므로 {@code @Tag("db")} 로 분리했다. {@code ./gradlew check} 에서는
 * 제외되고 {@code ./gradlew dbTest} 에서만 돈다. 접속 정보는 환경변수로 받는다:
 * {@code DONWORRY_TEST_DB_URL} / {@code DONWORRY_TEST_DB_USER} / {@code DONWORRY_TEST_DB_PASSWORD}.
 *
 * <p>컨텍스트가 뜨는 것 자체가 검증이다. Flyway 가 실패하거나 엔티티 매핑이 스키마와
 * 어긋나면 기동 단계에서 터진다.
 */
@Tag("db")
@SpringBootTest
class SchemaMigrationTests {

    /** 04-2 업무 테이블 25개 + Modulith EVENT_PUBLICATION. */
    private static final int EXPECTED_TABLE_COUNT = 26;

    @Autowired
    private DataSource dataSource;

    @Test
    void flyway_가_모든_migration_을_적용한다() throws Exception {
        try (Connection connection = dataSource.getConnection();
                Statement statement = connection.createStatement();
                ResultSet rs = statement.executeQuery(
                        "SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1")) {
            assertThat(rs.next()).isTrue();
            assertThat(rs.getInt(1)).isGreaterThanOrEqualTo(6);
        }
    }

    @Test
    void 업무_테이블과_이벤트_테이블이_모두_생성된다() throws Exception {
        try (Connection connection = dataSource.getConnection();
                Statement statement = connection.createStatement();
                ResultSet rs = statement.executeQuery(
                        "SELECT COUNT(*) FROM information_schema.TABLES"
                                + " WHERE TABLE_SCHEMA = DATABASE()"
                                + " AND TABLE_NAME <> 'flyway_schema_history'")) {
            assertThat(rs.next()).isTrue();
            assertThat(rs.getInt(1)).isEqualTo(EXPECTED_TABLE_COUNT);
        }
    }

    @Test
    void 결제의_주문_중복_방지_제약이_존재한다() throws Exception {
        assertUniqueIndexExists("payments", "uk_payments_merchant_order");
        assertUniqueIndexExists("case_payments", "uk_case_payments_payment");
        assertUniqueIndexExists("case_decisions", "uk_case_decisions_payment");
        assertUniqueIndexExists("case_subject_locks", "uk_case_subject_locks");
    }

    private void assertUniqueIndexExists(String table, String indexName) throws Exception {
        try (Connection connection = dataSource.getConnection();
                Statement statement = connection.createStatement();
                ResultSet rs = statement.executeQuery(
                        "SELECT COUNT(*) FROM information_schema.STATISTICS"
                                + " WHERE TABLE_SCHEMA = DATABASE()"
                                + " AND TABLE_NAME = '" + table + "'"
                                + " AND INDEX_NAME = '" + indexName + "'"
                                + " AND NON_UNIQUE = 0")) {
            assertThat(rs.next()).isTrue();
            assertThat(rs.getInt(1))
                    .withFailMessage("%s 의 UNIQUE 인덱스 %s 가 없다", table, indexName)
                    .isPositive();
        }
    }
}
