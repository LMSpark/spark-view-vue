package com.spark.ai.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.service.NavigationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * NavigationController 单元测试 — MockMvc + 模拟 Service。
 */
@WebMvcTest(NavigationController.class)
class NavigationControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @MockBean
    NavigationService navigationService;

    @Test
    void getNavConfig_returnsEmptyDefault_whenNoFile() throws Exception {
        when(navigationService.getNavConfig()).thenReturn(null);

        mockMvc.perform(get("/api/navigation"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.childPlacement").value("header"))
                .andExpect(jsonPath("$.children").isArray())
                .andExpect(jsonPath("$.children").isEmpty());
    }

    @Test
    void getNavConfig_returnsStoredConfig() throws Exception {
        Map<String, Object> config = Map.of(
                "childPlacement", "header",
                "children", List.of(
                        Map.of("id", "home", "title", "首页", "path", "/")
                )
        );
        when(navigationService.getNavConfig()).thenReturn(config);

        mockMvc.perform(get("/api/navigation"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.childPlacement").value("header"))
                .andExpect(jsonPath("$.children[0].id").value("home"));
    }

    @Test
    void saveNavConfig_success() throws Exception {
        Map<String, Object> nav = Map.of(
                "childPlacement", "header",
                "children", List.of(Map.of("id", "mod1", "title", "模块1"))
        );

        mockMvc.perform(put("/api/navigation")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(nav)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        verify(navigationService).saveNavConfig(any());
    }

    @Test
    void saveNavConfig_rejectsMissingChildren() throws Exception {
        mockMvc.perform(put("/api/navigation")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"childPlacement\":\"header\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void listNodes_returnsFlattened() throws Exception {
        List<Map<String, Object>> nodes = List.of(
                Map.of("id", "home", "title", "首页", "icon", "📊",
                        "path", "/", "hasChildren", false),
                Map.of("id", "data", "title", "数据管理", "icon", "🔗",
                        "path", "", "hasChildren", true)
        );
        when(navigationService.listNodes()).thenReturn(nodes);

        mockMvc.perform(get("/api/navigation/nodes"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("home"))
                .andExpect(jsonPath("$[1].hasChildren").value(true));
    }
}
