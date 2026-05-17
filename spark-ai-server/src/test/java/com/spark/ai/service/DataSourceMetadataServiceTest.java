package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.CryptoUtil;
import com.spark.ai.config.DynamicDataSourceManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class DataSourceMetadataServiceTest {

    private JdbcTemplate jdbcTemplate;
    private DynamicDataModelService modelService;
    private DataSourceServerService serverService;
    private DataSourceDatabaseService databaseService;
    private DataModelRelationService relationService;

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
        DynamicDataSourceManager dsManager = new DynamicDataSourceManager(dataSource, jdbcTemplate, cryptoUtil);
        modelService = new DynamicDataModelService(jdbcTemplate, objectMapper, dataSource, null, dsManager);
        modelService.ensureMetadataSchema();
        serverService = new DataSourceServerService(jdbcTemplate, cryptoUtil, dsManager);
        databaseService = new DataSourceDatabaseService(jdbcTemplate, cryptoUtil, dsManager, dataSource);
        relationService = new DataModelRelationService(jdbcTemplate);
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
        Map<String, Object> database = databaseService.createDatabase(tenantId, projectId, Map.of(
                "serverId", serverId.longValue(),
                "databaseName", databaseName,
                "isolationMode", "PROJECT_ISOLATED",
                "createNew", false,
                "connectionMode", "DIRECT"
        ), "tester");
        return (Number) database.get("ID");
    }

    private Map<String, Object> createTable(String tableName) {
        return modelService.createTable("t1", "p1", Map.of(
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
