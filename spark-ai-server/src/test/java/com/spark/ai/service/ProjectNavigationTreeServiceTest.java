package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.entity.NavigationNodeFlatEntity;
import com.spark.ai.repository.NavigationNodeFlatRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false"
})
class ProjectNavigationTreeServiceTest {

    @Autowired
    private NavigationNodeFlatRepository navigationNodeRepository;

    private ProjectNavigationTreeService service;

    @BeforeEach
    void setUp() {
        service = new ProjectNavigationTreeService(new ObjectMapper(), null, navigationNodeRepository);
    }

    @Test
    void listNestedNodes_respectsDepthLimit() throws Exception {
        service.importNavConfig("t1", "p1", createNavRoot(
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
        service.importNavConfig("t1", "p1", createNavRoot(
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
        service.importNavConfig("t1", "p1", createNavRoot(
                createNode("root", "根", "module", List.of(
                        createNode("before", "前序", "page", List.of()),
                        createNode("child", "子节点", "module", List.of(
                                createNode("leaf", "叶子", "page", List.of())
                        )),
                        createNode("after", "后序", "page", List.of())
                ))
        ));

        service.deleteNode("t1", "p1", "child");
        List<Map<String, Object>> nodes = service.listNodeChildren("t1", "p1", "root", null);

        assertEquals(2, nodes.size());
        assertEquals("before", nodes.get(0).get("id"));
        assertEquals(0, nodes.get(0).get("order"));
        assertEquals("after", nodes.get(1).get("id"));
        assertEquals(1, nodes.get(1).get("order"));
    }

    @Test
    void navigationOrder_isExposedAsOrderAndCanBeChangedByMoveOrPatch() throws Exception {
        service.importNavConfig("t1", "p1", createNavRoot(
                createNode("first", "第一", "page", "/first", List.of()),
                createNode("second", "第二", "page", List.of()),
                createNode("third", "第三", "page", List.of())
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

        Map<String, Object> updated = service.updateNode("t1", "p1", "third", Map.of("order", 0));
        assertEquals(0, updated.get("order"));

        service.updateNode("t1", "p1", "first", Map.of("order", 2));
        Map<String, Object> first = findNode(service.listNodes("t1", "p1"), "first");
        assertEquals("/first", first.get("path"));

        List<Map<String, Object>> patched = service.listNodes("t1", "p1");
        assertEquals("third", patched.get(0).get("id"));
        assertEquals(0, patched.get(0).get("order"));
        assertEquals("second", patched.get(1).get("id"));
        assertEquals(1, patched.get(1).get("order"));
    }

    @Test
    void updateNode_patchCanClearEditableFieldsAndPersistOrder() throws Exception {
        Map<String, Object> first = createNode("first", "第一", "page", "/first", List.of());
        first.put("description", "需求描述");
        first.put("icon", "Document");
        first.put("hidden", true);
        first.put("disabled", true);
        first.put("dividerAfter", true);
        first.put("refId", "old-ref");
        first.put("context", Map.of(
                "source", List.of(Map.of("id", "a", "title", "A")),
                "paramName", "projectId"
        ));
        service.importNavConfig("t1", "p1", createNavRoot(
                first,
                createNode("second", "第二", "page", List.of())
        ));

        Map<String, Object> beforeClear = findNode(service.listNodes("t1", "p1"), "first");
        @SuppressWarnings("unchecked")
        Map<String, Object> beforeContext = (Map<String, Object>) beforeClear.get("context");
        assertEquals("projectId", beforeContext.get("paramName"));

        service.updateNode("t1", "p1", "first", Map.ofEntries(
                Map.entry("description", ""),
                Map.entry("icon", ""),
                Map.entry("path", ""),
                Map.entry("hidden", false),
                Map.entry("disabled", false),
                Map.entry("dividerAfter", false),
                Map.entry("refId", ""),
                Map.entry("context", ""),
                Map.entry("order", 1)
        ));

        NavigationNodeFlatEntity updated = navigationNodeRepository
                .findByTenantIdAndProjectIdAndNodeId("t1", "p1", "first")
                .orElseThrow();
        assertEquals(null, updated.getDescription());
        assertEquals(null, updated.getIcon());
        assertEquals(null, updated.getPath());
        assertEquals(false, updated.getHidden());
        assertEquals(false, updated.getDisabled());
        assertEquals(false, updated.getDividerAfter());
        assertEquals(null, updated.getRefId());
        assertEquals(null, updated.getContext());
        assertEquals(1, updated.getOrder());
    }

    @Test
    void moveNode_compactsSourceAndTargetSiblingOrders() throws Exception {
        service.importNavConfig("t1", "p1", createNavRoot(
                createNode("root-a", "A", "module", List.of(
                        createNode("a1", "A1", "page", List.of()),
                        createNode("a2", "A2", "page", List.of()),
                        createNode("a3", "A3", "page", List.of())
                )),
                createNode("root-b", "B", "module", List.of(
                        createNode("b1", "B1", "page", List.of())
                ))
        ));

        service.moveNode("t1", "p1", "a2", "root-b", 1);

        List<Map<String, Object>> sourceChildren = service.listNodeChildren("t1", "p1", "root-a", null);
        assertEquals("a1", sourceChildren.get(0).get("id"));
        assertEquals(0, sourceChildren.get(0).get("order"));
        assertEquals("a3", sourceChildren.get(1).get("id"));
        assertEquals(1, sourceChildren.get(1).get("order"));

        List<Map<String, Object>> targetChildren = service.listNodeChildren("t1", "p1", "root-b", null);
        assertEquals("b1", targetChildren.get(0).get("id"));
        assertEquals(0, targetChildren.get(0).get("order"));
        assertEquals("a2", targetChildren.get(1).get("id"));
        assertEquals(1, targetChildren.get(1).get("order"));
    }

    @Test
    void importNavConfig_migratesLegacySubPageToNestedPage() throws Exception {
        Map<String, Object> subPage = createNode("order-detail", "订单详情", "sub-page", List.of());
        service.importNavConfig("t1", "p1", createNavRoot(
                createNode("orders", "订单", "page", "/orders", List.of(subPage))
        ));

        Map<String, Object> root = service.getNavConfig("t1", "p1");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> ordersChildren = (List<Map<String, Object>>) findNode(
                (List<Map<String, Object>>) root.get("children"), "orders").get("children");
        Map<String, Object> detail = ordersChildren.get(0);

        assertEquals("page", detail.get("nodeKind"));
        assertEquals(true, detail.get("hidden"));
        assertFalse(detail.containsKey("path"));
    }

        @SafeVarargs
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
                return createNode(id, title, nodeKind, "", children);
        }

        private Map<String, Object> createNode(String id,
                                                                                   String title,
                                                                                   String nodeKind,
                                                                                   String path,
                                                                                   List<Map<String, Object>> children) {
                Map<String, Object> node = new LinkedHashMap<>();
                node.put("id", id);
                node.put("title", title);
                node.put("nodeKind", nodeKind);
                if (!path.isBlank()) {
                        node.put("path", path);
                }
                if (!children.isEmpty()) {
                        node.put("children", new ArrayList<>(children));
                }
                return node;
        }

        private Map<String, Object> findNode(List<Map<String, Object>> nodes, String id) {
                return nodes.stream()
                        .filter(node -> id.equals(node.get("id")))
                        .findFirst()
                        .orElseThrow();
        }
}
