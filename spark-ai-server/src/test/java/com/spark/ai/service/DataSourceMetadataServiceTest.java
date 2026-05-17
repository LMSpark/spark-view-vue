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
                "isolationMode", "SHARED"
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
}
