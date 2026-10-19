-- ---------------------------------------------------------------------------
-- DonWorry 개발용 데이터베이스·계정 생성 (MariaDB, 관리자 계정으로 1회 실행)
--
-- 이 스크립트는 "그릇"만 만든다. 테이블은 Flyway 마이그레이션이 만든다.
-- (resources/db/migration — 스키마 수동 변경 금지)
--
-- 실행 방법 (Windows, MariaDB 클라이언트):
--   "C:\Program Files\MariaDB 12.2\bin\mariadb.exe" -h 127.0.0.1 -P 3307 -u root -p < docs/db/01-create-database.sql
--
--   -P 포트는 각자 환경에 맞춘다. 팀 기준 포트는 3306 이지만,
--   3306 이 MySQL 등 다른 서버에 점유된 머신에서는 MariaDB 포트를 확인해야 한다.
--   확인: SHOW VARIABLES LIKE 'port';  또는 MariaDB my.ini 의 port 값.
--
-- 아래 비밀번호는 application.yml 의 기본값과 맞춘 **로컬 개발 전용** 값이다.
-- 공유 서버·시연 환경에서는 반드시 다른 비밀번호를 쓰고
-- DONWORRY_DB_PASSWORD 환경변수 또는 application-local.yml 로 넘긴다.
-- ---------------------------------------------------------------------------

-- 1. 데이터베이스
CREATE DATABASE IF NOT EXISTS donworry
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_general_ci;

-- 2. 애플리케이션 계정
--    JDBC 가 127.0.0.1 로 접속하더라도 서버가 localhost 로 해석하는 경우가 있어 둘 다 만든다.
CREATE USER IF NOT EXISTS 'donworry'@'localhost'  IDENTIFIED BY 'donworry';
CREATE USER IF NOT EXISTS 'donworry'@'127.0.0.1'  IDENTIFIED BY 'donworry';

-- 3. 권한
--    Flyway 가 DDL 을 실행하므로 donworry 스키마에 대한 전체 권한이 필요하다.
--    다른 스키마와 서버 전역 권한은 주지 않는다.
GRANT ALL PRIVILEGES ON donworry.* TO 'donworry'@'localhost';
GRANT ALL PRIVILEGES ON donworry.* TO 'donworry'@'127.0.0.1';

FLUSH PRIVILEGES;

-- 4. 확인
SELECT SCHEMA_NAME, DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
  FROM information_schema.SCHEMATA
 WHERE SCHEMA_NAME = 'donworry';

SELECT User, Host FROM mysql.user WHERE User = 'donworry';

SHOW GRANTS FOR 'donworry'@'localhost';


-- ---------------------------------------------------------------------------
-- 문제 해결
-- ---------------------------------------------------------------------------
-- 1) 없는 계정으로 접속하면 MariaDB 12 가 "Access denied" 대신
--    "GSS-API authentication exception" (SQLState 28000 / 1045) 을 돌려줄 수 있다.
--    계정이 아직 없다는 뜻이므로 이 스크립트를 먼저 실행한다.
--    실행 후에도 같은 오류가 나면 인증 플러그인을 명시한다:
--      ALTER USER 'donworry'@'localhost'
--        IDENTIFIED VIA mysql_native_password USING PASSWORD('donworry');
--      ALTER USER 'donworry'@'127.0.0.1'
--        IDENTIFIED VIA mysql_native_password USING PASSWORD('donworry');
--      FLUSH PRIVILEGES;
--
-- 2) 접속한 서버가 MariaDB 인지 확인:  SELECT VERSION();
--    MySQL 이라면 포트를 잘못 지정한 것이다.

-- ---------------------------------------------------------------------------
-- 초기화가 필요할 때만 수동으로 실행 (데이터가 모두 사라진다)
-- ---------------------------------------------------------------------------
-- DROP DATABASE IF EXISTS donworry;
-- DROP USER IF EXISTS 'donworry'@'localhost';
-- DROP USER IF EXISTS 'donworry'@'127.0.0.1';
