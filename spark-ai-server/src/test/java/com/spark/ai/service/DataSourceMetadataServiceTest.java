package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.CryptoUtil;
import com.spark.ai.config.DatabaseDialect;
import com.spark.ai.config.DynamicDataSourceManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DataSourceMetadataServiceTest {

    private JdbcTemplate jdbcTemplate;
    private DynamicDataModelService modelService;
    private DataSourceServerService serverService;
    private DataSourceDatabaseService databaseService;
    private DataModelRelationService relationService;
    private DbmsCatalogService catalogService;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName("org.h2.Driver");
        dataSource.setUrl("jdbc:h2:mem:data-source-metadata-" + System.nanoTime() + ";MODE=LEGACY;DB_CLOSE_DELAY=-1");
        dataSource.setUsername("sa");
        dataSource.setPassword("");

        jdbcTemplate = new JdbcTemplate(dataSource);
        ObjectMapper objectMapper = new ObjectMapper();
        CryptoUtil cryptoUtil = new CryptoUtil("SparkViewTestCryptoSecretKey00000001");
        DynamicDataSourceManager dsManager = new DynamicDataSourceManager(dataSource, jdbcTemplate, cryptoUtil) {
            @Override
            public JdbcTemplate getJdbcTemplate(Long databaseId) {
                return jdbcTemplate;
            }

            @Override
            public DatabaseDialect getDialect(Long databaseId) {
                return DatabaseDialect.H2;
            }

            @Override
            public Connection createSingleConnection(String host, int port, String dbType, String username, String password) {
                try {
                    return dataSource.getConnection();
                } catch (SQLException e) {
                    throw new RuntimeException(e);
                }
            }

            @Override
            public Connection createDatabaseConnection(String host, int port, String dbType, String databaseName, String username, String password) {
                try {
                    return dataSource.getConnection();
                } catch (SQLException e) {
                    throw new RuntimeException(e);
                }
            }
        };
        modelService = new DynamicDataModelService(jdbcTemplate, objectMapper, dataSource, null, dsManager);
        modelService.ensureMetadataSchema();
        serverService = new DataSourceServerService(jdbcTemplate, cryptoUtil, dsManager);
        databaseService = new DataSourceDatabaseService(jdbcTemplate, cryptoUtil, dsManager, dataSource);
        relationService = new DataModelRelationService(jdbcTemplate);
        catalogService = new DbmsCatalogService(jdbcTemplate, cryptoUtil, dsManager, relationService, modelService);
    }

    @Test
    void dataSourceMetadataServicesUsePortableGeneratedKeys() {
        Map<String, Object> server = serverService.createServer(Map.of(
                "serverName", "H2 Test Server",
                "host", "localhost",
                "port", 9092,
                "dbType", "h2",
                "username", "sa",
                "password", "secret",
                "isolationMode", "TENANT_SHARED"
        ), true, "t1", "tester");
        Number serverId = (Number) server.get("ID");
        assertNotNull(serverId);
        assertEquals("***", server.get("password"));

        Map<String, Object> database = databaseService.createDatabase("t1", "p1", Map.of(
                "serverId", serverId.longValue(),
                "databaseName", "appdb",
                "isolationMode", "PROJECT_ISOLATED",
                "createNew", false,
                "connectionMode", "JNDI_XA",
                "jndiName", "java:/jdbc/AppDbXa"
        ), "tester");
        Number databaseId = (Number) database.get("ID");
        assertNotNull(databaseId);
        assertEquals("JNDI_XA", database.get("CONNECTION_MODE"));
        assertEquals("java:/jdbc/AppDbXa", database.get("JNDI_NAME"));

        Map<String, Object> parent = modelService.createTable("t1", "p1", Map.of(
                "tableName", "Orders",
                "columns", List.of(Map.of("name", "name", "type", "string"))
        ));
        Map<String, Object> child = modelService.createTable("t1", "p1", Map.of(
                "tableName", "Items",
                "columns", List.of(
                        Map.of("name", "orderId", "type", "number"),
                        Map.of("name", "name", "type", "string")
                )
        ));

        Map<String, Object> relation = relationService.createRelation(Map.of(
                "parentTableId", parent.get("id"),
                "childTableId", child.get("id"),
                "parentField", "id",
                "childField", "orderId",
                "relationName", "orders_items"
        ));

        assertNotNull(relation.get("ID"));
        assertEquals(1, relationService.listAllRelations("t1", "p1").size());
    }

    @Test
    void listDatabasesFiltersBySelectedServer() {
        Number serverOneId = createServer("Server One");
        Number serverTwoId = createServer("Server Two");
        Number databaseOneId = createDatabase("t1", "p1", serverOneId, "appdb_one");
        createDatabase("t1", "p1", serverTwoId, "appdb_two");

        List<Map<String, Object>> selectedServerDatabases =
                databaseService.listDatabases("t1", "p1", serverOneId.longValue());

        assertEquals(1, selectedServerDatabases.size());
        assertEquals(databaseOneId.longValue(), ((Number) selectedServerDatabases.get(0).get("ID")).longValue());
    }

    @Test
    void listDatabasesDeduplicatesByPhysicalDatabaseAndPrefersTenantShared() {
        Number serverId = createServer("Duplicate Database Server");
        Number projectDatabaseId = createDatabase("t1", "p1", serverId, "duplicate_db");
        Number sharedDatabaseId = createDatabase("t1", "p1", serverId, "duplicate_db", "TENANT_SHARED");

        List<Map<String, Object>> databases =
                databaseService.listDatabases("t1", "p1", serverId.longValue());

        assertEquals(1, databases.size());
        assertEquals(sharedDatabaseId.longValue(), ((Number) databases.get(0).get("ID")).longValue());
        assertEquals(sharedDatabaseId.longValue(), ((Number) databases.get(0).get("canonicalDatabaseId")).longValue());
        Object duplicateIds = databases.get(0).get("duplicateDatabaseIds");
        assertTrue(duplicateIds instanceof List<?> ids && ids.contains(projectDatabaseId.longValue()));
    }

    @Test
    void listPhysicalDatabaseNamesReadsServerCatalogAndFiltersSystemSchemas() {
        Number serverId = createServer("Physical Database Server");
        jdbcTemplate.execute("CREATE SCHEMA CRM_DB");
        jdbcTemplate.execute("CREATE SCHEMA SALES_DB");

        List<String> names = databaseService.listPhysicalDatabaseNames(serverId.longValue(), true, "t1");

        assertEquals(List.of("CRM_DB", "SALES_DB"), names);
    }

    @Test
    void listRelationsFiltersBySelectedDatabase() {
        Number serverId = createServer("Relation Server");
        Number databaseOneId = createDatabase("t1", "p1", serverId, "relation_db_one");
        Number databaseTwoId = createDatabase("t1", "p1", serverId, "relation_db_two");

        Map<String, Object> parentOne = createTable("OrdersForDbOne");
        Map<String, Object> childOne = createTable("ItemsForDbOne");
        Map<String, Object> parentTwo = createTable("OrdersForDbTwo");
        Map<String, Object> childTwo = createTable("ItemsForDbTwo");
        assignDatabase(parentOne, databaseOneId);
        assignDatabase(childOne, databaseOneId);
        assignDatabase(parentTwo, databaseTwoId);
        assignDatabase(childTwo, databaseTwoId);

        relationService.createRelation("t1", "p1", Map.of(
                "parentTableId", parentOne.get("id"),
                "childTableId", childOne.get("id"),
                "parentField", "id",
                "childField", "parentId",
                "relationName", "db_one_relation",
                "databaseId", databaseOneId.longValue()
        ));
        relationService.createRelation("t1", "p1", Map.of(
                "parentTableId", parentTwo.get("id"),
                "childTableId", childTwo.get("id"),
                "parentField", "id",
                "childField", "parentId",
                "relationName", "db_two_relation",
                "databaseId", databaseTwoId.longValue()
        ));

        List<Map<String, Object>> selectedDatabaseRelations =
                relationService.listAllRelations("t1", "p1", databaseOneId.longValue());

        assertEquals(1, selectedDatabaseRelations.size());
        assertEquals("db_one_relation", selectedDatabaseRelations.get(0).get("RELATION_NAME"));
        assertEquals(2, relationService.listAllRelations("t1", "p1").size());
        assertThrows(IllegalArgumentException.class, () -> relationService.createRelation("t1", "p1", Map.of(
                "parentTableId", parentOne.get("id"),
                "childTableId", childTwo.get("id"),
                "parentField", "id",
                "childField", "parentId",
                "databaseId", databaseOneId.longValue()
        )));
    }

    @Test
    void dataIsolationRejectsLegacyAndWiderChildModes() {
        assertThrows(IllegalArgumentException.class, () -> serverService.createServer(Map.of(
                "serverName", "Legacy Shared Server",
                "host", "localhost",
                "port", 9092,
                "dbType", "h2",
                "username", "sa",
                "password", "secret",
                "isolationMode", "SHARED"
        ), true, "t1", "tester"));

        Map<String, Object> projectIsolatedServer = serverService.createServer(Map.of(
                "serverName", "Project Server",
                "host", "localhost",
                "port", 9092,
                "dbType", "h2",
                "username", "sa",
                "password", "secret",
                "isolationMode", "PROJECT_ISOLATED"
        ), true, "t1", "tester");

        assertThrows(IllegalArgumentException.class, () -> databaseService.createDatabase("t1", "p1", Map.of(
                "serverId", ((Number) projectIsolatedServer.get("ID")).longValue(),
                "databaseName", "too_wide_db",
                "isolationMode", "TENANT_ISOLATED",
                "createNew", false,
                "connectionMode", "DIRECT"
        ), "tester"));

        Number serverId = createServer("Database Boundary Server");
        Number databaseId = createDatabase("t1", "p1", serverId, "project_isolated_db");

        assertThrows(IllegalArgumentException.class, () -> modelService.createTable("t1", "p1", Map.of(
                "tableName", "TooWideTable",
                "databaseId", databaseId.longValue(),
                "isolationMode", "TENANT_ISOLATED",
                "columns", List.of(Map.of("name", "name", "type", "string"))
        )));
    }

    @Test
    void importExistingTablesBindsExistingPhysicalMetadataWithoutDuplicating() {
        Number serverId = createServer("Import Existing Server");
        Number databaseId = createDatabase("t1", "p1", serverId, "import_existing_db");
        Map<String, Object> table = modelService.createTable("t1", "p1", Map.of(
                "tableName", "AlreadyImported",
                "columns", List.of(Map.of("name", "name", "type", "string"))
        ));
        String physicalTableName = (String) table.get("physicalTableName");
        Integer beforeCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM DATA_MODEL_TABLE", Integer.class);

        List<Map<String, Object>> imported = modelService.importExistingTables("t1", "p1", Map.of(
                "databaseId", databaseId.longValue(),
                "tables", List.of(Map.of("physicalTableName", physicalTableName))
        ));

        Integer afterCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM DATA_MODEL_TABLE", Integer.class);
        assertEquals(beforeCount, afterCount);
        assertEquals("AlreadyImported", imported.get(0).get("tableName"));
        assertEquals(databaseId.longValue(), ((Number) imported.get(0).get("databaseId")).longValue());
        assertEquals(databaseId.longValue(), jdbcTemplate.queryForObject(
                "SELECT DATABASE_ID FROM DATA_MODEL_TABLE WHERE LOGICAL_TABLE_NAME = ?",
                Number.class,
                "AlreadyImported"
        ).longValue());
    }

    @Test
    void importExistingTablesCanImportAllNonMetadataTables() {
        jdbcTemplate.execute("CREATE TABLE LEGACY_RECORD (NAME VARCHAR(64))");

        List<Map<String, Object>> imported = modelService.importExistingTables("t1", "p1", Map.of(
                "includeAllTables", true
        ));

        assertEquals(1, imported.size());
        assertEquals("legacyRecord", imported.get(0).get("tableName"));
        List<Map<String, Object>> columns = modelService.requireDefinition("t1", "p1", "legacyRecord")
                .columns()
                .stream()
                .map(column -> Map.<String, Object>of("name", column.columnName()))
                .toList();
        assertTrue(columns.stream().anyMatch(column -> "ID".equals(column.get("name"))));
        assertTrue(columns.stream().anyMatch(column -> "NAME".equals(column.get("name"))));
        assertTrue(columns.stream().anyMatch(column -> "TENANT_ID".equals(column.get("name"))));
        assertTrue(columns.stream().anyMatch(column -> "PROJECT_ID".equals(column.get("name"))));
    }

    @Test
    void dbmsSyncRegistersPhysicalCatalogAsTenantSharedAndIsIdempotent() {
        Number serverId = createServer("DBMS Catalog Server");
        jdbcTemplate.execute("CREATE SCHEMA CRM_SYNC");
        jdbcTemplate.execute("""
            CREATE TABLE CRM_SYNC.CUSTOMER (
                ID BIGINT PRIMARY KEY,
                NAME VARCHAR(64) NOT NULL
            )
            """);
        jdbcTemplate.execute("""
            CREATE TABLE CRM_SYNC.CUSTOMER_ORDER (
                ID BIGINT PRIMARY KEY,
                CUSTOMER_ID BIGINT NOT NULL,
                AMOUNT DECIMAL(12,2),
                CONSTRAINT FK_CUSTOMER_ORDER_CUSTOMER FOREIGN KEY (CUSTOMER_ID) REFERENCES CRM_SYNC.CUSTOMER(ID)
            )
            """);
        jdbcTemplate.execute("CREATE VIEW CRM_SYNC.CUSTOMER_VIEW AS SELECT ID, NAME FROM CRM_SYNC.CUSTOMER");

        Map<String, Object> request = Map.of(
                "scopeMode", "PLATFORM_SHARED",
                "databaseNames", List.of("CRM_SYNC"),
                "includeTables", true,
                "includeViews", true,
                "includeRelations", true,
                "mutatePhysicalObjectKeys", List.of()
        );
        Map<String, Object> firstSync = catalogService.sync("platform", "homepage", serverId.longValue(), request, "admin", true, "platform");
        Map<String, Object> secondSync = catalogService.sync("platform", "homepage", serverId.longValue(), request, "admin", true, "platform");

        assertEquals(1, ((Number) firstSync.get("databaseCount")).intValue());
        assertEquals(((Number) firstSync.get("objectCount")).intValue(), ((Number) secondSync.get("objectCount")).intValue());
        Number databaseId = jdbcTemplate.queryForObject("""
            SELECT ID FROM DATA_SOURCE_DATABASE
            WHERE SERVER_ID = ? AND DATABASE_NAME = ? AND ISOLATION_MODE = 'TENANT_SHARED'
            """, Number.class, serverId.longValue(), "CRM_SYNC");
        assertNotNull(databaseId);
        assertEquals(3, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM DATA_MODEL_TABLE WHERE DATABASE_ID = ?", Integer.class, databaseId.longValue()));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM DATA_MODEL_RELATION", Integer.class));

        List<Map<String, Object>> objects = modelService.listTablesByDatabase("platform", "homepage", databaseId.longValue());
        assertTrue(objects.stream().anyMatch(object -> "CUSTOMER".equals(object.get("physicalTableName")) && "TABLE".equals(object.get("objectType"))));
        assertTrue(objects.stream().anyMatch(object -> "CUSTOMER_VIEW".equals(object.get("physicalTableName")) && "VIEW".equals(object.get("objectType"))));
        Number customerId = jdbcTemplate.queryForObject(
                "SELECT ID FROM DATA_MODEL_TABLE WHERE DATABASE_ID = ? AND PHYSICAL_TABLE_NAME = ?",
                Number.class,
                databaseId.longValue(),
                "CUSTOMER"
        );
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> customerColumns = (List<Map<String, Object>>) modelService
                .getTablePayloadById("platform", "homepage", customerId.longValue())
                .get("columns");
        assertTrue(customerColumns.stream().anyMatch(column -> "ID".equals(column.get("name"))));
        assertTrue(customerColumns.stream().anyMatch(column -> "NAME".equals(column.get("physicalColumnName"))));

        jdbcTemplate.update("UPDATE DATA_MODEL_TABLE SET LOGICAL_TABLE_NAME = ? WHERE ID = ?", "CustomerAlias", customerId.longValue());
        catalogService.sync("platform", "homepage", serverId.longValue(), request, "admin", true, "platform");
        assertEquals("CustomerAlias", jdbcTemplate.queryForObject("SELECT LOGICAL_TABLE_NAME FROM DATA_MODEL_TABLE WHERE ID = ?", String.class, customerId.longValue()));
        assertEquals(3, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM DATA_MODEL_TABLE WHERE DATABASE_ID = ?", Integer.class, databaseId.longValue()));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM DATA_MODEL_RELATION", Integer.class));

        Map<String, Object> tableSql = catalogService.objectSql("platform", "homepage", customerId.longValue());
        assertEquals(customerId.longValue(), ((Number) tableSql.get("objectId")).longValue());
        assertEquals(Boolean.TRUE, tableSql.get("readOnly"));
        assertTrue(String.valueOf(tableSql.get("ddl")).contains("CREATE TABLE"));
        assertTrue(String.valueOf(tableSql.get("relationSql")).contains("ALTER TABLE"));

        Number viewId = jdbcTemplate.queryForObject(
                "SELECT ID FROM DATA_MODEL_TABLE WHERE DATABASE_ID = ? AND PHYSICAL_TABLE_NAME = ?",
                Number.class,
                databaseId.longValue(),
                "CUSTOMER_VIEW"
        );
        Map<String, Object> viewSql = catalogService.objectSql("platform", "homepage", viewId.longValue());
        assertEquals("VIEW", viewSql.get("objectType"));
        assertEquals(Boolean.TRUE, viewSql.get("readOnly"));
        assertTrue(String.valueOf(viewSql.get("ddl")).contains("CREATE VIEW"));
    }

    @Test
    void dbmsSyncMigratesDuplicateDatabaseMetadataToCanonicalDatabase() {
        Number serverId = createServer("Duplicate Metadata Server");
        Number duplicateDatabaseId = createDatabase("lmspark", "homepage", serverId, "DUP_SYNC");
        jdbcTemplate.execute("CREATE SCHEMA DUP_SYNC");
        jdbcTemplate.execute("""
            CREATE TABLE DUP_SYNC.LEGACY_CUSTOMER (
                ID BIGINT PRIMARY KEY,
                NAME VARCHAR(64)
            )
            """);
        jdbcTemplate.update("""
            INSERT INTO DATA_MODEL_TABLE (
                TENANT_ID, PROJECT_ID, LOGICAL_TABLE_NAME, ORIGIN, MANAGED_MODE,
                OBJECT_TYPE, SCHEMA_NAME, PHYSICAL_TABLE_NAME, PRIMARY_KEY_FIELD,
                DATABASE_ID, ISOLATION_MODE, SCHEMA_VERSION, STATUS, CREATED_AT, UPDATED_AT
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """,
                "lmspark",
                "homepage",
                "LegacyCustomerAlias",
                "existing-imported",
                "readonly",
                "TABLE",
                "DUP_SYNC",
                "LEGACY_CUSTOMER",
                "ID",
                duplicateDatabaseId.longValue(),
                "PROJECT_ISOLATED");
        Number legacyTableId = jdbcTemplate.queryForObject(
                "SELECT ID FROM DATA_MODEL_TABLE WHERE DATABASE_ID = ? AND PHYSICAL_TABLE_NAME = ?",
                Number.class,
                duplicateDatabaseId.longValue(),
                "LEGACY_CUSTOMER"
        );

        catalogService.sync("platform", "homepage", serverId.longValue(), Map.of(
                "scopeMode", "PLATFORM_SHARED",
                "databaseNames", List.of("DUP_SYNC"),
                "includeTables", true,
                "includeViews", true,
                "includeRelations", true,
                "mutatePhysicalObjectKeys", List.of()
        ), "admin", true, "platform");

        Number canonicalDatabaseId = jdbcTemplate.queryForObject("""
            SELECT ID FROM DATA_SOURCE_DATABASE
            WHERE SERVER_ID = ? AND DATABASE_NAME = ? AND ISOLATION_MODE = 'TENANT_SHARED'
            """, Number.class, serverId.longValue(), "DUP_SYNC");
        Map<String, Object> migrated = jdbcTemplate.queryForMap(
                "SELECT TENANT_ID, PROJECT_ID, LOGICAL_TABLE_NAME, DATABASE_ID, ISOLATION_MODE FROM DATA_MODEL_TABLE WHERE ID = ?",
                legacyTableId.longValue()
        );
        assertEquals(canonicalDatabaseId.longValue(), ((Number) migrated.get("DATABASE_ID")).longValue());
        assertEquals("platform", migrated.get("TENANT_ID"));
        assertEquals("homepage", migrated.get("PROJECT_ID"));
        assertEquals("TENANT_SHARED", migrated.get("ISOLATION_MODE"));
        assertEquals("LegacyCustomerAlias", migrated.get("LOGICAL_TABLE_NAME"));
        assertEquals(1, jdbcTemplate.queryForObject("""
            SELECT COUNT(*) FROM DATA_MODEL_TABLE
            WHERE DATABASE_ID = ? AND PHYSICAL_TABLE_NAME = ?
            """, Integer.class, canonicalDatabaseId.longValue(), "LEGACY_CUSTOMER"));
    }

    private Number createServer(String serverName) {
        Map<String, Object> server = serverService.createServer(Map.of(
                "serverName", serverName,
                "host", "localhost",
                "port", 9092,
                "dbType", "h2",
                "username", "sa",
                "password", "secret",
                "isolationMode", "TENANT_SHARED"
        ), true, "t1", "tester");
        return (Number) server.get("ID");
    }

    private Number createDatabase(String tenantId, String projectId, Number serverId, String databaseName) {
        return createDatabase(tenantId, projectId, serverId, databaseName, "PROJECT_ISOLATED");
    }

    private Number createDatabase(String tenantId, String projectId, Number serverId, String databaseName, String isolationMode) {
        Map<String, Object> database = databaseService.createDatabase(tenantId, projectId, Map.of(
                "serverId", serverId.longValue(),
                "databaseName", databaseName,
                "isolationMode", isolationMode,
                "createNew", false,
                "connectionMode", "DIRECT"
        ), "tester");
        return (Number) database.get("ID");
    }

    private Map<String, Object> createTable(String tableName) {
        return createTable("t1", "p1", tableName);
    }

    private Map<String, Object> createTable(String tenantId, String projectId, String tableName) {
        return modelService.createTable(tenantId, projectId, Map.of(
                "tableName", tableName,
                "columns", List.of(
                        Map.of("name", "parentId", "type", "number"),
                        Map.of("name", "name", "type", "string")
                )
        ));
    }

    private void assignDatabase(Map<String, Object> table, Number databaseId) {
        jdbcTemplate.update(
                "UPDATE DATA_MODEL_TABLE SET DATABASE_ID = ? WHERE ID = ?",
                databaseId.longValue(),
                ((Number) table.get("id")).longValue()
        );
    }
}
