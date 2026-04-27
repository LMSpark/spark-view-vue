package com.spark.ai.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.service.FilterExpressionCaseService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(FilterExpressionCaseController.class)
@AutoConfigureMockMvc(addFilters = false)
class FilterExpressionCaseControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @MockBean
    FilterExpressionCaseService caseService;

    @Test
    void query_acceptsQueryEnvelope() throws Exception {
        when(caseService.queryCases(eq("t1"), eq("p1"), any()))
                .thenReturn(Map.of(
                        "rows", List.of(Map.of("id", 1L, "title", "alpha")),
                        "total", 1,
                        "page", 1,
                        "pageSize", 20
                ));

        mockMvc.perform(post("/api/tenants/t1/projects/p1/filter-expression-cases/query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "query", Map.of(
                                        "page", 1,
                                        "pageSize", 20,
                                        "filter", Map.of("field", "status", "op", "==", "value", "open")
                                )
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].id").value(1))
                .andExpect(jsonPath("$.total").value(1));

        verify(caseService).queryCases(eq("t1"), eq("p1"), any());
    }

    @Test
    void query_rejectsNonObjectEnvelope() throws Exception {
        mockMvc.perform(post("/api/tenants/t1/projects/p1/filter-expression-cases/query")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\": []}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("query 必须是对象"));
    }

    @Test
    void create_returnsCreatedRecord() throws Exception {
        when(caseService.createCase(eq("t1"), eq("p1"), any()))
                .thenReturn(Map.of(
                        "id", 11L,
                        "title", "alpha",
                        "status", "open",
                        "priority", 2,
                        "amount", 12,
                        "threshold", 10,
                        "amountDelta", 2,
                        "category", "demo"
                ));

        mockMvc.perform(post("/api/tenants/t1/projects/p1/filter-expression-cases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "title", "alpha",
                                "status", "open",
                                "priority", 2,
                                "amount", 12,
                                "threshold", 10,
                                "category", "demo"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(11))
                .andExpect(jsonPath("$.amountDelta").value(2));
    }

    @Test
    void get_returns404WhenMissing() throws Exception {
        when(caseService.getCase("t1", "p1", 99L)).thenReturn(null);

        mockMvc.perform(get("/api/tenants/t1/projects/p1/filter-expression-cases/99"))
                .andExpect(status().isNotFound());
    }

    @Test
    void update_returns404WhenRecordMissing() throws Exception {
        when(caseService.updateCase(eq("t1"), eq("p1"), eq(99L), any()))
                .thenThrow(new NoSuchElementException("missing"));

        mockMvc.perform(put("/api/tenants/t1/projects/p1/filter-expression-cases/99")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"beta\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void delete_returnsOk() throws Exception {
        mockMvc.perform(delete("/api/tenants/t1/projects/p1/filter-expression-cases/7"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));

        verify(caseService).deleteCase("t1", "p1", 7L);
    }

    @Test
    void delete_returns404WhenMissing() throws Exception {
        doThrow(new NoSuchElementException("missing"))
                .when(caseService).deleteCase("t1", "p1", 7L);

        mockMvc.perform(delete("/api/tenants/t1/projects/p1/filter-expression-cases/7"))
                .andExpect(status().isNotFound());
    }
}