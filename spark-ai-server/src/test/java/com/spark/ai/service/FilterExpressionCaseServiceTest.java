package com.spark.ai.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class FilterExpressionCaseServiceTest {

    private FilterExpressionCaseService service;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName("org.h2.Driver");
        dataSource.setUrl("jdbc:h2:mem:filter-expression-case-" + System.nanoTime() + ";MODE=LEGACY;DB_CLOSE_DELAY=-1");
        dataSource.setUsername("sa");
        dataSource.setPassword("");

        service = new FilterExpressionCaseService(new JdbcTemplate(dataSource));
        service.ensureSchema();
    }

    @Test
    void queryCases_supportsStructuredFieldRefSortAndPagination() {
        service.createCase("t1", "p1", payload("alpha", "open", 2, 12, 10, "demo"));
        Map<String, Object> beta = service.createCase("t1", "p1", payload("beta", "open", 5, 18, 15, "demo"));
        service.createCase("t1", "p1", payload("gamma", "closed", 4, 8, 10, "demo"));

        Map<String, Object> result = service.queryCases("t1", "p1", Map.of(
                "page", 1,
                "pageSize", 1,
                "sort", "priority:desc",
                "filter", Map.of(
                        "type", "and",
                        "children", List.of(
                                Map.of("field", "status", "op", "==", "value", "open"),
                                Map.of("field", "amount", "op", ">=", "value", Map.of("kind", "field", "field", "threshold"))
                        )
                )
        ));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.get("rows");

        assertEquals(2, result.get("total"));
        assertEquals(1, rows.size());
        assertEquals(beta.get("id"), rows.get(0).get("id"));
    }

    @Test
    void queryCases_supportsComputedTopLevelFieldAndNegation() {
        Map<String, Object> alpha = service.createCase("t1", "p1", payload("alpha", "open", 2, 12, 10, "demo"));
        service.createCase("t1", "p1", payload("beta", "open", 5, 18, 15, "demo"));
        Map<String, Object> gamma = service.createCase("t1", "p1", payload("gamma", "closed", 4, 8, 10, "demo"));

        Map<String, Object> result = service.queryCases("t1", "p1", Map.of(
                "filter", Map.of(
                        "type", "!condition",
                        "field", "amountDelta",
                        "op", ">",
                        "value", BigDecimal.ZERO
                )
        ));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.get("rows");

        assertEquals(List.of(gamma.get("id")), rows.stream().map(row -> row.get("id")).toList());
        assertEquals(alpha.get("id"), service.getCase("t1", "p1", ((Number) alpha.get("id")).longValue()).get("id"));
    }

    @Test
    void queryCases_rejectsMissingFieldRef() {
        service.createCase("t1", "p1", payload("alpha", "open", 2, 12, 10, "demo"));

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.queryCases("t1", "p1", Map.of(
                        "filter", Map.of(
                                "field", "amount",
                                "op", ">=",
                                "value", Map.of("kind", "field", "field", "missingField")
                        )
                )));

        assertEquals("过滤值表达式引用了不存在的字段 \"missingField\"", error.getMessage());
    }

    @Test
    void crudLifecycle_works() {
        Map<String, Object> created = service.createCase("t1", "p1", payload("alpha", "draft", 1, 9, 10, "demo"));
        long id = ((Number) created.get("id")).longValue();

        Map<String, Object> updated = service.updateCase("t1", "p1", id, Map.of(
                "title", "alpha-updated",
                "status", "open",
                "threshold", 7
        ));

        assertEquals("alpha-updated", updated.get("title"));
        assertEquals("open", updated.get("status"));
        assertTrue(((BigDecimal) updated.get("amountDelta")).compareTo(new BigDecimal("2.00")) == 0);

        service.deleteCase("t1", "p1", id);
        assertNull(service.getCase("t1", "p1", id));
    }

    private Map<String, Object> payload(
            String title,
            String status,
            int priority,
            int amount,
            int threshold,
            String category
    ) {
        return Map.of(
                "title", title,
                "status", status,
                "priority", priority,
                "amount", amount,
                "threshold", threshold,
                "category", category
        );
    }
}