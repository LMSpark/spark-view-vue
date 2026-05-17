package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ProjectNavigationTreeServiceTest {

    private ProjectNavigationTreeService service;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName("org.h2.Driver");
        dataSource.setUrl("jdbc:h2:mem:navigation-tree-" + System.nanoTime() + ";MODE=LEGACY;DB_CLOSE_DELAY=-1");
        dataSource.setUsername("sa");
        dataSource.setPassword("");

        JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
        service = new ProjectNavigationTreeService(new ObjectMapper(), jdbcTemplate);
        service.ensureSchema();
    }

    @Test
    void listNestedNodes_respectsDepthLimit() throws Exception {
        service.saveNavConfig("t1", "p1", createNavRoot(
                createNode("root", "根", "module", List.of(
                        createNode("child", "子节点", "module", List.of(
                                createNode("leaf", "叶子", "page", List.of())
                        ))
                ))
        ));

        List<Map<String, Object>> nodes = service.listNestedNodes("t1", "p1", null, null, 1);

        assertEquals(1, nodes.size());
        assertEquals("root", nodes.get(0).get("id"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> children = (List<Map<String, Object>>) nodes.get(0).get("children");
        assertEquals(1, children.size());
        assertEquals("child", children.get(0).get("id"));
        assertEquals(false, children.get(0).containsKey("children"));
    }

    @Test
    void moveNode_rejectsMovingIntoDescendant() throws Exception {
        service.saveNavConfig("t1", "p1", createNavRoot(
                createNode("root", "根", "module", List.of(
                        createNode("leaf", "叶子", "page", List.of())
                ))
        ));

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.moveNode("t1", "p1", "root", "leaf", -1));

        assertEquals("不能将节点移动到其自身的子孙节点下", error.getMessage());
    }

    @Test
    void deleteNode_removesDescendantsFromFlatList() throws Exception {
        service.saveNavConfig("t1", "p1", createNavRoot(
                createNode("root", "根", "module", List.of(
                        createNode("child", "子节点", "module", List.of(
                                createNode("leaf", "叶子", "page", List.of())
                        ))
                ))
        ));

        service.deleteNode("t1", "p1", "child");
        List<Map<String, Object>> nodes = service.listNodes("t1", "p1");

        assertEquals(1, nodes.size());
        assertEquals("root", nodes.get(0).get("id"));
    }

    @Test
    void navigationOrder_isExposedAsOrderAndOnlyChangedByMoveNode() throws Exception {
        service.saveNavConfig("t1", "p1", createNavRoot(
                createNode("first", "第一", "page", List.of()),
                createNode("second", "第二", "page", List.of())
        ));

        List<Map<String, Object>> nodes = service.listNodes("t1", "p1");
        assertEquals(0, nodes.get(0).get("order"));
        assertEquals(1, nodes.get(1).get("order"));
        assertFalse(nodes.get(0).containsKey("sortOrder"));

        Map<String, Object> moved = service.moveNode("t1", "p1", "second", null, 0);
        assertEquals(0, moved.get("order"));

        List<Map<String, Object>> reordered = service.listNodes("t1", "p1");
        assertEquals("second", reordered.get(0).get("id"));
        assertEquals(0, reordered.get(0).get("order"));

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.updateNode("t1", "p1", "second", Map.of("order", 9)));
        assertEquals("排序只能通过 moveNode 调整", error.getMessage());
    }

        private Map<String, Object> createNavRoot(Map<String, Object>... children) {
                Map<String, Object> root = new LinkedHashMap<>();
                root.put("childPlacement", "header");
                root.put("children", new ArrayList<>(List.of(children)));
                return root;
        }

        private Map<String, Object> createNode(String id,
                                                                                   String title,
                                                                                   String nodeKind,
                                                                                   List<Map<String, Object>> children) {
                Map<String, Object> node = new LinkedHashMap<>();
                node.put("id", id);
                node.put("title", title);
                node.put("nodeKind", nodeKind);
                if (!children.isEmpty()) {
                        node.put("children", new ArrayList<>(children));
                }
                return node;
        }
}
