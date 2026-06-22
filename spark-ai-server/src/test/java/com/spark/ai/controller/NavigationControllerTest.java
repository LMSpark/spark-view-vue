package com.spark.ai.controller;

import com.spark.ai.service.ProjectNavigationTreeService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * NavigationController 单元测试 — MockMvc + 模拟 Service。
 */
@WebMvcTest(NavigationController.class)
@AutoConfigureMockMvc(addFilters = false)
class NavigationControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockBean
        ProjectNavigationTreeService navigationTreeService;

    @Test
    void getNavConfig_returnsEmptyDefault_whenNoFile() throws Exception {
        when(navigationTreeService.getNavConfig("t1", "p1")).thenReturn(null);

        mockMvc.perform(get("/api/tenants/t1/projects/p1/navigation"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.childPlacement").value("header"))
                .andExpect(jsonPath("$.data.children").isArray())
                .andExpect(jsonPath("$.data.children").isEmpty());
    }

    @Test
    void getNavConfig_returnsStoredConfig() throws Exception {
        Map<String, Object> config = Map.of(
                "childPlacement", "header",
                "children", List.of(
                        Map.of("id", "home", "title", "首页", "path", "/")
                )
        );
        when(navigationTreeService.getNavConfig("t1", "p1")).thenReturn(config);

        mockMvc.perform(get("/api/tenants/t1/projects/p1/navigation"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.childPlacement").value("header"))
                .andExpect(jsonPath("$.data.children[0].id").value("home"));
    }

    @Test
    void rootNavigationPut_isNotExposed() throws Exception {
        mockMvc.perform(put("/api/tenants/t1/projects/p1/navigation"))
                .andExpect(status().isMethodNotAllowed());

        verifyNoInteractions(navigationTreeService);
    }

    @Test
    void rootNavigationPost_isNotExposed() throws Exception {
        mockMvc.perform(post("/api/tenants/t1/projects/p1/navigation"))
                .andExpect(status().isMethodNotAllowed());

        verifyNoInteractions(navigationTreeService);
    }

    @Test
    void updateNode_allowsOrderPatchForAiReorder() throws Exception {
        when(navigationTreeService.updateNode(eq("t1"), eq("p1"), eq("leaf"), anyMap()))
                .thenReturn(Map.of("id", "leaf", "title", "叶子", "order", 0));

        mockMvc.perform(put("/api/tenants/t1/projects/p1/navigation/nodes/leaf")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"叶子\",\"order\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.node.order").value(0));

        verify(navigationTreeService).updateNode(
                eq("t1"),
                eq("p1"),
                eq("leaf"),
                argThat(patch -> patch.containsKey("order") && patch.get("order").equals(0)));
    }

    @Test
    void listNodes_returnsFlattened() throws Exception {
        List<Map<String, Object>> nodes = List.of(
                Map.of("id", "home", "title", "首页", "icon", "📊",
                        "path", "/", "hasChildren", false),
                Map.of("id", "data", "title", "数据管理", "icon", "🔗",
                        "path", "", "hasChildren", true)
        );
        when(navigationTreeService.listNodes("t1", "p1")).thenReturn(nodes);

        mockMvc.perform(get("/api/tenants/t1/projects/p1/navigation/nodes"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value("home"))
                .andExpect(jsonPath("$.data[1].hasChildren").value(true));
    }

        @Test
        void listNodes_acceptsTreeModeQueryParam() throws Exception {
                when(navigationTreeService.listNestedNodes("t1", "p1", null, null, null)).thenReturn(List.of());

                mockMvc.perform(get("/api/tenants/t1/projects/p1/navigation/nodes")
                                                .param("treeMode", "nested"))
                                .andExpect(status().isOk());

                verify(navigationTreeService).listNestedNodes("t1", "p1", null, null, null);
        }

            @Test
        void listNodes_returnsNestedPayloadWhenTreeModeIsNested() throws Exception {
                when(navigationTreeService.listNestedNodes("t1", "p1", null, null, null))
                        .thenReturn(List.of(Map.of("id", "home", "title", "首页", "children", List.of())));

                mockMvc.perform(get("/api/tenants/t1/projects/p1/navigation/nodes")
                                .param("treeMode", "nested"))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.data[0].id").value("home"));
            }

            @Test
        void listNodes_returnsDirectChildrenWhenParentIdProvided() throws Exception {
                when(navigationTreeService.listNodeChildren("t1", "p1", "root", 10))
                        .thenReturn(List.of(Map.of("id", "child-1", "parentId", "root", "title", "子节点")));

                mockMvc.perform(get("/api/tenants/t1/projects/p1/navigation/nodes")
                                .param("parentId", "root")
                                .param("limit", "10"))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.data[0].parentId").value("root"));
            }

            @Test
            void getNodePath_returnsPathIds() throws Exception {
                when(navigationTreeService.getNodePath("t1", "p1", "leaf"))
                        .thenReturn(Map.of("pathIds", List.of("root", "leaf")));

                mockMvc.perform(get("/api/tenants/t1/projects/p1/navigation/nodes/path/leaf"))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.data.pathIds[0]").value("root"));
            }

            @Test
            void getNodeSubtree_requiresToId() throws Exception {
                mockMvc.perform(post("/api/tenants/t1/projects/p1/navigation/nodes/subtree")
                                .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                        .andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.error.message").value("缺少 toId 字段"));
            }

            @Test
            void searchNodes_returnsNestedMatchesWhenTreeModeIsNested() throws Exception {
                when(navigationTreeService.searchNestedNodes("t1", "p1", "leaf", 5))
                        .thenReturn(List.of(Map.of(
                                "node", Map.of("id", "leaf", "title", "叶子"),
                                "path", List.of(Map.of("id", "root", "title", "根"), Map.of("id", "leaf", "title", "叶子"))
                        )));

                mockMvc.perform(get("/api/tenants/t1/projects/p1/navigation/nodes/search")
                                .param("keyword", "leaf")
                                .param("limit", "5")
                                .param("treeMode", "nested"))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.data[0].node.id").value("leaf"));
            }

            @Test
            void searchNodes_returnsFlatMatchesWhenTreeModeIsFlat() throws Exception {
                when(navigationTreeService.searchFlatNodes("t1", "p1", "home", 5))
                        .thenReturn(List.of(Map.of("id", "home", "title", "首页")));

                mockMvc.perform(get("/api/tenants/t1/projects/p1/navigation/nodes/search")
                                .param("keyword", "home")
                                .param("limit", "5")
                                .param("treeMode", "flat"))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.data[0].id").value("home"));
            }

        @Test
        void listNodes_rejectsInvalidTreeMode() throws Exception {
                mockMvc.perform(get("/api/tenants/t1/projects/p1/navigation/nodes")
                                                .param("treeMode", "weird"))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.error.message").value("非法 treeMode: weird"));

                verify(navigationTreeService, never()).listNodes(anyString(), anyString());
        }
}
