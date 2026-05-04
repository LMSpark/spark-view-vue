package com.spark.ai.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.service.FilterExpressionCaseService;
import com.spark.ai.service.ScenarioFunctionExecutionService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ScenarioFunctionController.class)
@Import(ScenarioFunctionExecutionService.class)
@AutoConfigureMockMvc(addFilters = false)
class ScenarioFunctionControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @MockBean
    FilterExpressionCaseService filterExpressionCaseService;

    // ─────────────────────────────────────────────────────────
    // 协议阶段：v3 与请求结构校验
    // ─────────────────────────────────────────────────────────

    @Test
    void executeFunction_requiresProtocolV3() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "callId", "call-1",
                "arguments", Map.of()
        ));

        mockMvc.perform(post("/api/ai/scenario-functions/filterExpressionCases.query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-Tenant-Id", "tenant-1")
                        .header("X-Project-Id", "project-1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_PROTOCOL_VERSION"))
                .andExpect(jsonPath("$.error.category").value("request-validation"))
                .andExpect(jsonPath("$.protocolVersion").value(3));

        verify(filterExpressionCaseService, never()).queryCases(anyString(), anyString(), any());
    }

    @Test
    void executeFunction_rejectsInvalidArgumentsShape() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "callId", "call-1",
                "arguments", "not-object"
        ));

        mockMvc.perform(post("/api/ai/scenario-functions/filterExpressionCases.query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-Tenant-Id", "tenant-1")
                        .header("X-Project-Id", "project-1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_ARGUMENTS"))
                .andExpect(jsonPath("$.error.message").value("arguments 必须是对象"));

        verify(filterExpressionCaseService, never()).queryCases(anyString(), anyString(), any());
    }

    // ─────────────────────────────────────────────────────────
    // 路由阶段：函数名与 scope 校验
    // ─────────────────────────────────────────────────────────

    @Test
    void executeFunction_returnsNotFoundForUnknownFunction() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "callId", "call-unknown",
                "arguments", Map.of()
        ));

        mockMvc.perform(post("/api/ai/scenario-functions/missing.query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-Tenant-Id", "tenant-1")
                        .header("X-Project-Id", "project-1"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("UNKNOWN_FUNCTION"))
                .andExpect(jsonPath("$.error.category").value("scenario-function"))
                .andExpect(jsonPath("$.functionName").value("missing.query"));

        verify(filterExpressionCaseService, never()).queryCases(anyString(), anyString(), any());
    }

    @Test
    void executeFunction_requiresTenantAndProjectScope() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "callId", "call-1",
                "arguments", Map.of()
        ));

        mockMvc.perform(post("/api/ai/scenario-functions/filterExpressionCases.query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("MISSING_SCOPE"))
                .andExpect(jsonPath("$.error.message").value("tenantId 和 projectId 不能为空"));

        verify(filterExpressionCaseService, never()).queryCases(anyString(), anyString(), any());
    }

    // ─────────────────────────────────────────────────────────
    // 执行阶段：query FC 成功与失败投影
    // ─────────────────────────────────────────────────────────

    @Test
    void executeFunction_runsFilterExpressionQueryWithContextScope() throws Exception {
        when(filterExpressionCaseService.queryCases(eq("tenant-body"), eq("project-body"), any()))
                .thenReturn(Map.of(
                        "rows", List.of(Map.of("id", 1, "title", "alpha")),
                        "total", 1,
                        "page", 1,
                        "pageSize", 10
                ));

        String body = objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "callId", "call-query",
                "context", Map.of("tenantId", "tenant-body", "projectId", "project-body"),
                "arguments", Map.of("page", 1, "pageSize", 10)
        ));

        mockMvc.perform(post("/api/ai/scenario-functions/filterExpressionCases.query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.callId").value("call-query"))
                .andExpect(jsonPath("$.functionName").value("filterExpressionCases.query"))
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.status").value("executed"))
                .andExpect(jsonPath("$.executionHost").value("backend"))
                .andExpect(jsonPath("$.result.total").value(1))
                .andExpect(jsonPath("$.result.rows[0].title").value("alpha"));
    }

    @Test
    void executeFunction_usesHeaderScopeBeforeBodyContext() throws Exception {
        when(filterExpressionCaseService.queryCases(eq("tenant-header"), eq("project-header"), any()))
                .thenReturn(Map.of("rows", List.of(), "total", 0, "page", 2, "pageSize", 5));

        String body = objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "callId", "call-header-scope",
                "context", Map.of("tenantId", "tenant-body", "projectId", "project-body"),
                "arguments", Map.of("page", 2, "pageSize", 5)
        ));

        mockMvc.perform(post("/api/ai/scenario-functions/filterExpressionCases.query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-Tenant-Id", "tenant-header")
                        .header("X-Project-Id", "project-header"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.result.page").value(2));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> queryCaptor = ArgumentCaptor.forClass(Map.class);
        verify(filterExpressionCaseService).queryCases(eq("tenant-header"), eq("project-header"), queryCaptor.capture());
        assertEquals(2, queryCaptor.getValue().get("page"));
        assertEquals(5, queryCaptor.getValue().get("pageSize"));
    }

    @Test
    void executeFunction_returnsFunctionFailedResultWhenQueryThrows() throws Exception {
        when(filterExpressionCaseService.queryCases(eq("tenant-1"), eq("project-1"), any()))
                .thenThrow(new IllegalArgumentException("过滤值表达式引用了不存在的字段 \"missingField\""));

        String body = objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "callId", "call-failed",
                "arguments", Map.of("filter", Map.of(
                        "field", "amount",
                        "op", ">=",
                        "value", Map.of("kind", "field", "field", "missingField")
                ))
        ));

        mockMvc.perform(post("/api/ai/scenario-functions/filterExpressionCases.query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-Tenant-Id", "tenant-1")
                        .header("X-Project-Id", "project-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.callId").value("call-failed"))
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.status").value("failed"))
                .andExpect(jsonPath("$.executionHost").value("backend"))
                .andExpect(jsonPath("$.error").value("过滤值表达式引用了不存在的字段 \"missingField\""));
    }
}