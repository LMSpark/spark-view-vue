package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DynamicDataServiceTest {

    private JdbcTemplate jdbcTemplate;
    private DynamicDataModelService modelService;
    private DynamicDataService dataService;
        private TransactionTemplate transactionTemplate;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName("org.h2.Driver");
        dataSource.setUrl("jdbc:h2:mem:dynamic-data-" + System.nanoTime() + ";MODE=LEGACY;DB_CLOSE_DELAY=-1");
        dataSource.setUsername("sa");
        dataSource.setPassword("");

        jdbcTemplate = new JdbcTemplate(dataSource);
        ObjectMapper objectMapper = new ObjectMapper();
        modelService = new DynamicDataModelService(jdbcTemplate, objectMapper, dataSource);
        modelService.ensureMetadataSchema();
        dataService = new DynamicDataService(jdbcTemplate, objectMapper, modelService, new SseService());
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
                ),
                "views", Map.of(
                        "default", Map.of(
                                "page", 1,
                                "pageSize", 20,
                                "aggregates", Map.of("totalAmount", Map.of("type", "sum", "field", "amount"))
                        )
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

        private Map<String, Object> executeTransaction(Map<String, Object> body) {
                Map<String, Object> result = transactionTemplate.execute(status -> dataService.executeTransaction("t1", "p1", body));
                assertNotNull(result);
                return result;
        }
}
