package com.spark.ai.controller;

import com.spark.ai.api.ApiResponseFactory;
import com.spark.ai.service.ScenarioFunctionExecutionService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * AI 场景后端 Function Calling 入口。
 *
 * <p>协议目标：给 `host='backend'` 的场景工具提供最小可运行后端 executor。
 * 该入口只执行函数并返回 FC 结果，不写入 AI session，也不触发下一轮 LLM turn。
 */
@RestController
@RequestMapping("/api/ai/scenario-functions")
public class ScenarioFunctionController {

    private static final int PROTOCOL_VERSION_V3 = 3;
    private static final int PROTOCOL_VERSION_V4 = ApiResponseFactory.PROTOCOL_VERSION;

    private final ScenarioFunctionExecutionService executionService;

    public ScenarioFunctionController(ScenarioFunctionExecutionService executionService) {
        this.executionService = executionService;
    }

    // ─────────────────────────────────────────────────────────
    // 流程分区：HTTP 执行入口
    // ─────────────────────────────────────────────────────────

    /**
     * POST /api/ai/scenario-functions/{functionName}
     *
     * <p>时序：协议校验 -> 函数名校验 -> scope 解析 -> arguments 解析 -> 后端执行。
     */
    @PostMapping("/{functionName}")
    public ResponseEntity<Map<String, Object>> executeFunction(
            @PathVariable String functionName,
            @RequestHeader(value = "X-Tenant-Id", required = false) String tenantIdHeader,
            @RequestHeader(value = "X-Project-Id", required = false) String projectIdHeader,
            @RequestBody(required = false) Map<String, Object> request
    ) {
        if (!isSupportedProtocol(request)) {
            return requestError("INVALID_PROTOCOL_VERSION", "仅支持 protocolVersion=3/4");
        }

        String callId = getRequiredString(request, "callId");
        if (callId == null) {
            return requestError("MISSING_REQUIRED_FIELD", "callId 不能为空");
        }

        if (!executionService.isKnownFunction(functionName)) {
            return unknownFunctionError(functionName);
        }

        Map<String, Object> context;
        try {
            context = readOptionalObject(request, "context");
        } catch (IllegalArgumentException error) {
            return requestError("INVALID_CONTEXT", error.getMessage());
        }

        String tenantId = resolveScopedString(tenantIdHeader, context.get("tenantId"));
        String projectId = resolveScopedString(projectIdHeader, context.get("projectId"));
        if (tenantId == null || projectId == null) {
            return requestError("MISSING_SCOPE", "tenantId 和 projectId 不能为空");
        }

        Map<String, Object> arguments;
        try {
            arguments = readOptionalObject(request, "arguments");
        } catch (IllegalArgumentException error) {
            return requestError("INVALID_ARGUMENTS", error.getMessage());
        }

        return ResponseEntity.ok(executionService.execute(functionName, callId, tenantId, projectId, arguments));
    }

    // ─────────────────────────────────────────────────────────
    // 功能分区：请求解析
    // ─────────────────────────────────────────────────────────

    private static boolean isSupportedProtocol(Map<String, Object> request) {
        if (request == null) {
            return false;
        }
        Object protocolVersion = request.get("protocolVersion");
        if (protocolVersion instanceof Number n) {
            int value = n.intValue();
            return value == PROTOCOL_VERSION_V3 || value == PROTOCOL_VERSION_V4;
        }
        return false;
    }

    private static String getRequiredString(Map<String, Object> request, String key) {
        Object value = request.get(key);
        if (value instanceof String text && !text.isBlank()) {
            return text.trim();
        }
        return null;
    }

    private static String resolveScopedString(String headerValue, Object contextValue) {
        if (headerValue != null && !headerValue.isBlank()) {
            return headerValue.trim();
        }
        if (contextValue instanceof String text && !text.isBlank()) {
            return text.trim();
        }
        return null;
    }

    private static Map<String, Object> readOptionalObject(Map<String, Object> request, String key) {
        Object raw = request.get(key);
        if (raw == null) {
            return Map.of();
        }
        if (!(raw instanceof Map<?, ?> rawMap)) {
            throw new IllegalArgumentException(key + " 必须是对象");
        }

        Map<String, Object> normalized = new LinkedHashMap<>();
        rawMap.forEach((rawKey, value) -> normalized.put(String.valueOf(rawKey), value));
        return normalized;
    }

    // ─────────────────────────────────────────────────────────
    // 功能分区：错误包络
    // ─────────────────────────────────────────────────────────

    private static ResponseEntity<Map<String, Object>> requestError(String code, String message) {
        return errorEnvelope(HttpStatus.BAD_REQUEST, "request-validation", code, "fix-request", message, null);
    }

    private static ResponseEntity<Map<String, Object>> unknownFunctionError(String functionName) {
        return errorEnvelope(
                HttpStatus.NOT_FOUND,
                "scenario-function",
                "UNKNOWN_FUNCTION",
                "fix-function-name",
                "后端函数未注册: " + functionName,
                functionName
        );
    }

    private static ResponseEntity<Map<String, Object>> errorEnvelope(
            HttpStatus status,
            String category,
            String code,
            String retryPolicy,
            String message,
            String functionName
    ) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("severity", "error");
        error.put("category", category);
        error.put("code", code);
        error.put("retryPolicy", retryPolicy);
        error.put("message", message);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", error);
        if (functionName != null && !functionName.isBlank()) {
            body.put("functionName", functionName);
        }
        body.put("protocolVersion", PROTOCOL_VERSION_V4);
        return ResponseEntity.status(status).body(body);
    }
}
