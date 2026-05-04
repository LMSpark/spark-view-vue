package com.spark.ai.service;

import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * AI 场景后端 Function Calling 执行服务。
 *
 * <p>职责边界：
 * <ul>
 *   <li>只负责按 functionName 调度后端 FC。</li>
 *   <li>不创建、不追加、不裁剪 AI session。</li>
 *   <li>把已进入函数执行阶段的业务异常转换为 FC failed 结果。</li>
 * </ul>
 */
@Service
public class ScenarioFunctionExecutionService {

    public static final String FUNCTION_FILTER_EXPRESSION_CASES_QUERY = "filterExpressionCases.query";

    private static final String EXECUTION_HOST_BACKEND = "backend";
    private static final String STATUS_EXECUTED = "executed";
    private static final String STATUS_FAILED = "failed";

    private final FilterExpressionCaseService filterExpressionCaseService;

    public ScenarioFunctionExecutionService(FilterExpressionCaseService filterExpressionCaseService) {
        this.filterExpressionCaseService = filterExpressionCaseService;
    }

    // ─────────────────────────────────────────────────────────
    // 功能分区：函数目录
    // ─────────────────────────────────────────────────────────

    /**
     * 判断后端第一版 executor 是否认识该函数。
     *
     * <p>当前只允许精确匹配规范名，不做别名或大小写兼容，避免误路由。
     */
    public boolean isKnownFunction(String functionName) {
        return FUNCTION_FILTER_EXPRESSION_CASES_QUERY.equals(functionName);
    }

    // ─────────────────────────────────────────────────────────
    // 流程分区：执行入口
    // ─────────────────────────────────────────────────────────

    /**
     * 执行一次后端 FC，并返回 AiScenarioFunctionCallResult 风格的 Map。
     */
    public Map<String, Object> execute(
            String functionName,
            String callId,
            String tenantId,
            String projectId,
            Map<String, Object> arguments
    ) {
        if (FUNCTION_FILTER_EXPRESSION_CASES_QUERY.equals(functionName)) {
            return executeFilterExpressionCasesQuery(functionName, callId, tenantId, projectId, arguments);
        }

        throw new IllegalArgumentException("未知后端函数: " + functionName);
    }

    // ─────────────────────────────────────────────────────────
    // 功能分区：内置查询类 FC
    // ─────────────────────────────────────────────────────────

    /**
     * filterExpressionCases.query：复用既有租户/项目 scoped 查询服务。
     */
    private Map<String, Object> executeFilterExpressionCasesQuery(
            String functionName,
            String callId,
            String tenantId,
            String projectId,
            Map<String, Object> arguments
    ) {
        try {
            Map<String, Object> result = filterExpressionCaseService.queryCases(tenantId, projectId, arguments);
            return executedResult(callId, functionName, result);
        } catch (RuntimeException error) {
            return failedResult(callId, functionName, errorMessage(error));
        }
    }

    // ─────────────────────────────────────────────────────────
    // 功能分区：结果构造
    // ─────────────────────────────────────────────────────────

    private Map<String, Object> executedResult(String callId, String functionName, Object result) {
        Map<String, Object> body = baseResult(callId, functionName, true, STATUS_EXECUTED);
        body.put("result", result);
        return body;
    }

    private Map<String, Object> failedResult(String callId, String functionName, String error) {
        Map<String, Object> body = baseResult(callId, functionName, false, STATUS_FAILED);
        body.put("error", error);
        return body;
    }

    private Map<String, Object> baseResult(String callId, String functionName, boolean ok, String status) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("callId", callId);
        body.put("functionName", functionName);
        body.put("ok", ok);
        body.put("status", status);
        body.put("executionHost", EXECUTION_HOST_BACKEND);
        return body;
    }

    private String errorMessage(RuntimeException error) {
        String message = error.getMessage();
        return message == null || message.isBlank() ? error.getClass().getSimpleName() : message;
    }
}