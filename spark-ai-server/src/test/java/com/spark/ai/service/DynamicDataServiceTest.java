package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.CryptoUtil;
import com.spark.ai.config.DynamicDataSourceManager;
import com.spark.ai.config.DynamicDataSourceProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.jta.JtaTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BooleanSupplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DynamicDataServiceTest {

    private JdbcTemplate jdbcTemplate;
    private DriverManagerDataSource dataSource;
    private ObjectMapper objectMapper;
    private DynamicDataModelService modelService;
    private DynamicDataService dataService;
    private RecordingSseService sseService;
    private TransactionTemplate transactionTemplate;

    @BeforeEach
    void setUp() {
        dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName("org.h2.Driver");
        dataSource.setUrl("jdbc:h2:mem:dynamic-data-" + System.nanoTime() + ";MODE=LEGACY;DB_CLOSE_DELAY=-1");
        dataSource.setUsername("sa");
        dataSource.setPassword("");

        jdbcTemplate = new JdbcTemplate(dataSource);
        objectMapper = new ObjectMapper();
        modelService = new DynamicDataModelService(jdbcTemplate, objectMapper, dataSource);
        modelService.ensureMetadataSchema();
        sseService = new RecordingSseService();
        dataService = new DynamicDataService(jdbcTemplate, objectMapper, modelService, sseService);
        transactionTemplate = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    }

    @Test
    void dynamicTable_supportsCrudDataViewQueryAndAggregate() {
        modelService.createTable("t1", "p1", Map.of(
                "tableName", "Orders",
                "columns", List.of(
                        Map.of("name", "name", "type", "string"),
                        Map.of("name", "status", "type", "string"),
                        Map.of("name", "amount", "type", "decimal")
                )
        ));

        Map<String, Object> alpha = dataService.createRecord("t1", "p1", "Orders", Map.of(
                "name", "alpha",
                "status", "open",
                "amount", 12
        ));
        dataService.createRecord("t1", "p1", "Orders", Map.of(
                "name", "beta",
                "status", "open",
                "amount", 18
        ));
        dataService.createRecord("t1", "p1", "Orders", Map.of(
                "name", "gamma",
                "status", "closed",
                "amount", 7
        ));

        Map<String, Object> result = dataService.query("t1", "p1", "Orders", Map.of(
                "query", Map.of(
                        "filter", Map.of("status", "open"),
                        "sort", "amount:desc",
                        "page", 1,
                        "pageSize", 1
                ),
                "viewConfig", Map.of(
                        "aggregates", Map.of("totalAmount", Map.of("type", "sum", "field", "amount"))
                )
        ));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.get("rows");
        @SuppressWarnings("unchecked")
        Map<String, Object> aggregate = (Map<String, Object>) result.get("aggregateResult");

        assertNotNull(alpha.get("id"));
        assertEquals(2, result.get("total"));
        assertEquals("beta", rows.get(0).get("name"));
        assertEquals(30.0, (Double) aggregate.get("totalAmount"), 0.001);
        assertTrue((Boolean) modelService.consistency("t1", "p1", "Orders").get("consistent"));
    }

    @Test
    void dataModelMetadata_rejectsViewsAndOmitsViewsInPayload() {
        IllegalArgumentException createError = assertThrows(IllegalArgumentException.class, () ->
                modelService.createTable("t1", "p1", Map.of(
                        "tableName", "Orders",
                        "columns", List.of(Map.of("name", "name", "type", "string")),
                        "views", Map.of("default", Map.of())
                ))
        );
        assertTrue(createError.getMessage().contains("views 不属于后端表元数据"));

        modelService.createTable("t1", "p1", Map.of(
                "tableName", "Orders",
                "columns", List.of(Map.of("name", "name", "type", "string"))
        ));

        Map<String, Object> payload = modelService.getTablePayload("t1", "p1", "Orders");
        assertFalse(payload.containsKey("views"));

        IllegalArgumentException updateError = assertThrows(IllegalArgumentException.class, () ->
                modelService.updateTable("t1", "p1", "Orders", Map.of("views", Map.of("default", Map.of())))
        );
        assertTrue(updateError.getMessage().contains("views 不属于后端表元数据"));

        jdbcTemplate.execute("CREATE TABLE LEGACY_VIEW_TEST (NAME VARCHAR(255))");
        IllegalArgumentException importError = assertThrows(IllegalArgumentException.class, () ->
                modelService.importExistingTables("t1", "p1", Map.of(
                        "tables", List.of(Map.of(
                                "physicalTableName", "LEGACY_VIEW_TEST",
                                "logicalTableName", "LegacyViewTest",
                                "views", Map.of("default", Map.of())
                        ))
                ))
        );
        assertTrue(importError.getMessage().contains("views 不属于后端表元数据"));
    }

    @Test
    void updateTable_preflightDoesNotApplyAddColumnBeforeDangerousChanges() {
        Map<String, Object> created = modelService.createTable("t1", "p1", Map.of(
                "tableName", "Orders",
                "columns", List.of(Map.of("name", "name", "type", "string"))
        ));
        String physicalTableName = String.valueOf(created.get("physicalTableName"));

        DynamicDataModelService.PreflightRequiredException error = assertThrows(
                DynamicDataModelService.PreflightRequiredException.class,
                () -> modelService.updateTable("t1", "p1", "Orders", Map.of(
                        "columns", List.of(
                                Map.of("name", "name", "type", "number"),
                                Map.of("name", "status", "type", "string")
                        )
                ))
        );
        assertTrue(error.getMessage().contains("结构变更包含危险操作"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> columns = (List<Map<String, Object>>) modelService.describePhysicalTable(physicalTableName).get("columns");
        assertFalse(columns.stream().anyMatch(column -> "STATUS".equals(column.get("physicalColumnName"))));
    }

    @Test
    void importExistingTable_forcesManagedShapeAndCrudAccess() {
        jdbcTemplate.execute("CREATE TABLE LEGACY_ITEM (NAME VARCHAR(255), AMOUNT INT)");
        jdbcTemplate.update("INSERT INTO LEGACY_ITEM (NAME, AMOUNT) VALUES (?, ?)", "legacy", 9);

        List<Map<String, Object>> imported = modelService.importExistingTables("t1", "p1", Map.of(
                "tables", List.of(Map.of("physicalTableName", "LEGACY_ITEM", "logicalTableName", "LegacyItem"))
        ));

        assertEquals(1, imported.size());
        assertEquals(1, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM LEGACY_ITEM WHERE TENANT_ID = ? AND PROJECT_ID = ?", Integer.class, "t1", "p1"));

        Map<String, Object> queryResult = dataService.query("t1", "p1", "LegacyItem", Map.of(
                "query", Map.of("filter", Map.of("name", "legacy"))
        ));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) queryResult.get("rows");

        assertEquals(1, rows.size());
        assertEquals("legacy", rows.get(0).get("name"));
        assertEquals(9, ((Number) rows.get(0).get("amount")).intValue());
    }

    @Test
    void executeTransaction_commitsMultipleTablesAtomically() {
        createOrderAndItemTables();
        Map<String, Object> order = dataService.createRecord("t1", "p1", "Orders", Map.of("name", "order-a"));
        Map<String, Object> item = dataService.createRecord("t1", "p1", "Items", Map.of(
                "orderId", order.get("id"),
                "name", "item-a"
        ));

        Map<String, Object> result = executeTransaction(Map.of(
                "operations", List.of(
                        Map.of(
                                "operationId", "update-order",
                                "tableName", "Orders",
                                "op", "update",
                                "pk", Map.of("id", order.get("id")),
                                "data", Map.of("name", "order-b")
                        ),
                        Map.of(
                                "operationId", "update-item",
                                "tableName", "Items",
                                "op", "update",
                                "pk", Map.of("id", item.get("id")),
                                "data", Map.of("name", "item-b")
                        )
                )
        ));

        assertEquals(true, result.get("success"));
        assertEquals("order-b", dataService.getRecord("t1", "p1", "Orders", Map.of("id", order.get("id"))).get("name"));
        assertEquals("item-b", dataService.getRecord("t1", "p1", "Items", Map.of("id", item.get("id"))).get("name"));
    }

    @Test
    void executeTransaction_rollsBackWhenAnyOperationFails() {
        createOrderAndItemTables();
        Map<String, Object> order = dataService.createRecord("t1", "p1", "Orders", Map.of("name", "order-a"));

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () ->
                transactionTemplate.executeWithoutResult(status -> dataService.executeTransaction("t1", "p1", Map.of(
                        "operations", List.of(
                                Map.of(
                                        "operationId", "update-order",
                                        "tableName", "Orders",
                                        "op", "update",
                                        "pk", Map.of("id", order.get("id")),
                                        "data", Map.of("name", "order-b")
                                ),
                                Map.of(
                                        "operationId", "missing-item",
                                        "tableName", "Items",
                                        "op", "update",
                                        "pk", Map.of("id", 9999),
                                        "data", Map.of("name", "item-b")
                                )
                        )
                        )))
                );
        assertTrue(error.getMessage().contains("missing-item"));

        assertEquals("order-a", dataService.getRecord("t1", "p1", "Orders", Map.of("id", order.get("id"))).get("name"));
    }

    @Test
    void executeTransaction_replaysCommittedRequestIdAcrossRetries() {
        createOrderAndItemTables();
        Map<String, Object> body = Map.of(
                "requestId", "tx-retry-001",
                "operations", List.of(
                        Map.of(
                                "operationId", "create-order",
                                "tableName", "Orders",
                                "op", "create",
                                "data", Map.of("name", "order-a")
                        )
                )
        );

        Map<String, Object> first = executeTransaction(body);
        Map<String, Object> second = executeTransaction(body);

        assertEquals("tx-retry-001", first.get("requestId"));
        assertEquals(first.get("transactionId"), second.get("transactionId"));
        assertEquals(true, second.get("replayed"));
        assertEquals(1, ((Number) dataService.query("t1", "p1", "Orders", Map.of()).get("total")).intValue());
    }

    @Test
    void executeTransaction_rejectsRequestIdWithDifferentOperations() {
        createOrderAndItemTables();
        Map<String, Object> first = Map.of(
                "requestId", "tx-conflict-001",
                "operations", List.of(
                        Map.of(
                                "operationId", "create-order",
                                "tableName", "Orders",
                                "op", "create",
                                "data", Map.of("name", "order-a")
                        )
                )
        );
        Map<String, Object> second = Map.of(
                "requestId", "tx-conflict-001",
                "operations", List.of(
                        Map.of(
                                "operationId", "create-order",
                                "tableName", "Orders",
                                "op", "create",
                                "data", Map.of("name", "order-b")
                        )
                )
        );

        executeTransaction(first);
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> executeTransaction(second));

        assertTrue(error.getMessage().contains("requestId 已用于不同事务"));
        assertEquals(1, ((Number) dataService.query("t1", "p1", "Orders", Map.of()).get("total")).intValue());
    }

    @Test
    void executeTransaction_rejectsOperationsAcrossDatabaseIds() {
        createOrderAndItemTables();
        jdbcTemplate.update("UPDATE DATA_MODEL_TABLE SET DATABASE_ID = ? WHERE LOGICAL_TABLE_NAME = ?", 101, "Orders");
        jdbcTemplate.update("UPDATE DATA_MODEL_TABLE SET DATABASE_ID = ? WHERE LOGICAL_TABLE_NAME = ?", 202, "Items");

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> executeTransaction(Map.of(
                "operations", List.of(
                        Map.of(
                                "operationId", "create-order",
                                "tableName", "Orders",
                                "op", "create",
                                "data", Map.of("name", "order-a")
                        ),
                        Map.of(
                                "operationId", "create-item",
                                "tableName", "Items",
                                "op", "create",
                                "data", Map.of("orderId", 1, "name", "item-a")
                        )
                )
        )));

        assertTrue(error.getMessage().contains("跨数据库事务需要启用 jta-jndi 模式"));
        assertEquals(0, ((Number) dataService.query("t1", "p1", "Orders", Map.of()).get("total")).intValue());
    }

    @Test
    void executeTransaction_rejectsCrossDatabaseWhenJtaModeHasDirectDatabase() {
        JtaFixture fixture = createJtaFixture();
        fixture.createOrderAndItemTablesOnDatabases(
                Map.of("connectionMode", "DIRECT"),
                Map.of("connectionMode", "JNDI_XA", "jndiName", "java:/jdbc/ItemsXa")
        );

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () ->
                fixture.dataService.executeTransaction("t1", "p1", crossDatabaseCreateBody()));

        assertTrue(error.getMessage().contains("跨数据库事务要求所有数据库为 JNDI_XA"));
    }

    @Test
    void executeTransaction_rejectsCrossDatabaseWhenJtaModeMissingJndiName() {
        JtaFixture fixture = createJtaFixture();
        long ordersDb = fixture.registerDatabase(Map.of("connectionMode", "JNDI_XA", "jndiName", "java:/jdbc/OrdersXa"));
        long itemsDb = fixture.registerDatabase(Map.of("connectionMode", "JNDI_XA"));
        fixture.createOrderAndItemTablesOnDatabaseIds(ordersDb, itemsDb);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () ->
                fixture.dataService.executeTransaction("t1", "p1", crossDatabaseCreateBody()));

        assertTrue(error.getMessage().contains("缺少 jndiName"));
    }

    @Test
    void executeTransaction_reportsJndiLookupFailureWithDatabaseIdAndName() {
        JtaFixture fixture = createJtaFixture();
        fixture.createOrderAndItemTablesOnDatabases(
                Map.of("connectionMode", "JNDI_XA", "jndiName", "java:/jdbc/MissingOrdersXa"),
                Map.of("connectionMode", "JNDI_XA", "jndiName", "java:/jdbc/MissingItemsXa")
        );

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () ->
                fixture.dataService.executeTransaction("t1", "p1", crossDatabaseCreateBody()));

        assertTrue(error.getMessage().contains("JNDI 数据源 lookup 失败"));
        assertTrue(error.getMessage().contains("java:/jdbc/MissingOrdersXa"));
    }

    @Test
    void submitBatchJob_emitsOneDataChangePerSuccessfulOperation() throws Exception {
        modelService.createTable("t1", "p1", Map.of(
                "tableName", "Orders",
                "columns", List.of(Map.of("name", "name", "type", "string"))
        ));

        Map<String, Object> job = dataService.submitBatchJob("t1", "p1", Map.of(
                "operations", List.of(Map.of(
                        "operationId", "create-order",
                        "tableName", "Orders",
                        "op", "create",
                        "data", Map.of("name", "order-a")
                ))
        ));
        String jobId = String.valueOf(job.get("jobId"));

        waitUntil(() -> sseService.hasBatchStatus(jobId, "success"));

        assertEquals(1, sseService.countDataChanges(jobId));
        assertEquals(1, ((Number) dataService.query("t1", "p1", "Orders", Map.of()).get("total")).intValue());
    }

    private void createOrderAndItemTables() {
        modelService.createTable("t1", "p1", Map.of(
                "tableName", "Orders",
                "columns", List.of(Map.of("name", "name", "type", "string"))
        ));
        modelService.createTable("t1", "p1", Map.of(
                "tableName", "Items",
                "columns", List.of(
                        Map.of("name", "orderId", "type", "number"),
                        Map.of("name", "name", "type", "string")
                )
        ));
    }

    private Map<String, Object> crossDatabaseCreateBody() {
        return Map.of(
                "operations", List.of(
                        Map.of(
                                "operationId", "create-order",
                                "tableName", "Orders",
                                "op", "create",
                                "data", Map.of("name", "order-a")
                        ),
                        Map.of(
                                "operationId", "create-item",
                                "tableName", "Items",
                                "op", "create",
                                "data", Map.of("orderId", 1, "name", "item-a")
                        )
                )
        );
    }

    private JtaFixture createJtaFixture() {
        DynamicDataSourceProperties properties = new DynamicDataSourceProperties();
        properties.setMode("jta-jndi");
        CryptoUtil cryptoUtil = new CryptoUtil("SparkViewTestCryptoSecretKey00000001");
        DynamicDataSourceManager dsManager = new DynamicDataSourceManager(dataSource, jdbcTemplate, cryptoUtil, properties);
        DynamicDataModelService jtaModelService = new DynamicDataModelService(jdbcTemplate, objectMapper, dataSource, null, dsManager);
        jtaModelService.ensureMetadataSchema();
        jdbcTemplate.update("""
            INSERT INTO DATA_SOURCE_SERVER (
                SERVER_NAME, HOST, PORT, DB_TYPE, USERNAME, PASSWORD,
                ISOLATION_MODE, TENANT_ID, CREATED_BY, STATUS, CREATED_AT, UPDATED_AT
            ) VALUES ('XA Test Server', 'localhost', 3306, 'mysql', 'spark', 'encrypted',
                'SHARED', NULL, 'tester', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """);
        DynamicDataService jtaDataService = new DynamicDataService(
                jdbcTemplate,
                objectMapper,
                jtaModelService,
                sseService,
                new JtaTransactionManager()
        );
        return new JtaFixture(jtaModelService, jtaDataService);
    }

    private final class JtaFixture {
        private final DynamicDataModelService modelService;
        private final DynamicDataService dataService;

        private JtaFixture(DynamicDataModelService modelService, DynamicDataService dataService) {
            this.modelService = modelService;
            this.dataService = dataService;
        }

        void createOrderAndItemTablesOnDatabases(Map<String, Object> ordersDatabase, Map<String, Object> itemsDatabase) {
            long ordersDb = registerDatabase(ordersDatabase);
            long itemsDb = registerDatabase(itemsDatabase);
            createOrderAndItemTablesOnDatabaseIds(ordersDb, itemsDb);
        }

        void createOrderAndItemTablesOnDatabaseIds(long ordersDb, long itemsDb) {
            createOrderAndItemTablesFor(modelService);
            jdbcTemplate.update("UPDATE DATA_MODEL_TABLE SET DATABASE_ID = ? WHERE LOGICAL_TABLE_NAME = ?", ordersDb, "Orders");
            jdbcTemplate.update("UPDATE DATA_MODEL_TABLE SET DATABASE_ID = ? WHERE LOGICAL_TABLE_NAME = ?", itemsDb, "Items");
        }

        long registerDatabase(Map<String, Object> databaseOverrides) {
            Number serverId = jdbcTemplate.queryForObject("SELECT ID FROM DATA_SOURCE_SERVER WHERE SERVER_NAME = ?", Number.class, "XA Test Server");
            if (serverId == null) {
                throw new IllegalStateException("XA Test Server not found");
            }
            Map<String, Object> values = new java.util.LinkedHashMap<>(databaseOverrides);
            String databaseName = "db_" + System.nanoTime();
            String connectionMode = String.valueOf(values.getOrDefault("connectionMode", "DIRECT"));
            Object jndiName = values.get("jndiName");
            jdbcTemplate.update("""
                INSERT INTO DATA_SOURCE_DATABASE (
                    SERVER_ID, DATABASE_NAME, ISOLATION_MODE, TENANT_ID, PROJECT_ID,
                    CONNECTION_MODE, JNDI_NAME, CREATED_BY, STATUS, CREATED_AT, UPDATED_AT
                ) VALUES (?, ?, 'PROJECT_ISOLATED', 't1', 'p1', ?, ?, 'tester', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """,
                    serverId.longValue(),
                    databaseName,
                    connectionMode,
                    jndiName
            );
            return jdbcTemplate.queryForObject("SELECT ID FROM DATA_SOURCE_DATABASE WHERE DATABASE_NAME = ?", Long.class, databaseName);
        }
    }

    private void createOrderAndItemTablesFor(DynamicDataModelService targetModelService) {
        targetModelService.createTable("t1", "p1", Map.of(
                "tableName", "Orders",
                "columns", List.of(Map.of("name", "name", "type", "string"))
        ));
        targetModelService.createTable("t1", "p1", Map.of(
                "tableName", "Items",
                "columns", List.of(
                        Map.of("name", "orderId", "type", "number"),
                        Map.of("name", "name", "type", "string")
                )
        ));
    }

    private Map<String, Object> executeTransaction(Map<String, Object> body) {
        Map<String, Object> result = transactionTemplate.execute(status -> dataService.executeTransaction("t1", "p1", body));
        assertNotNull(result);
        return result;
    }

    private static void waitUntil(BooleanSupplier condition) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 3000;
        while (System.currentTimeMillis() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(20);
        }
        assertTrue(condition.getAsBoolean());
    }

    private static final class RecordingSseService extends SseService {
        private final List<Event> events = new CopyOnWriteArrayList<>();

        @Override
        public void emit(String eventType, Object payload) {
            events.add(new Event(eventType, payload));
        }

        boolean hasBatchStatus(String jobId, String status) {
            return events.stream().anyMatch(event ->
                    EVENT_DATA_BATCH_JOB.equals(event.type())
                            && event.payload() instanceof Map<?, ?> payload
                            && jobId.equals(String.valueOf(payload.get("jobId")))
                            && status.equals(String.valueOf(payload.get("status")))
            );
        }

        long countDataChanges(String jobId) {
            return events.stream().filter(event ->
                    EVENT_DATA_CHANGE.equals(event.type())
                            && event.payload() instanceof Map<?, ?> payload
                            && jobId.equals(String.valueOf(payload.get("jobId")))
            ).count();
        }
    }

    private record Event(String type, Object payload) {}
}
