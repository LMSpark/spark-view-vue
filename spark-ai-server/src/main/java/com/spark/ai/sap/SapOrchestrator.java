package com.spark.ai.sap;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.sap.handler.ActionExecutionException;
import com.spark.ai.sap.handler.ActionHandler;
import com.spark.ai.sap.handler.ActionRegistry;
import com.spark.ai.sap.handler.ActionValidationException;
import com.spark.ai.sap.model.SapError;
import com.spark.ai.sap.model.SapProtocolBlock;
import com.spark.ai.sap.model.SapResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * SAP/1.0 协议编排器 — 拦截、校验、执行的统一入口。
 *
 * <h3>职责</h3>
 * <ol>
 *   <li>解析 AI 输出的 SAP 协议块</li>
 *   <li>根据 action 路由到 {@link ActionHandler}</li>
 *   <li>参数校验失败 → 返回 {@code @@error}（含 fix 信息，AI 自动纠错）</li>
 *   <li>执行成功 → 返回 {@code @@result}</li>
 *   <li>{@code describe:system.capabilities} → 返回所有已注册动作列表</li>
 * </ol>
 *
 * <h3>工具回路</h3>
 * <p>此方法的返回值会作为 "tool result" 回灌给 AI。AI 看到 @@error 后会自动修正参数并重新调用。
 * 整个纠错过程对用户透明。
 */
@Service
public class SapOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(SapOrchestrator.class);

    private final ActionRegistry registry;
    private final ObjectMapper objectMapper;

    public SapOrchestrator(ActionRegistry registry, ObjectMapper objectMapper) {
        this.registry = registry;
        this.objectMapper = objectMapper;
    }

    /**
     * 处理一段 SAP 协议文本（可能包含多个协议块，取第一个执行）。
     *
     * @param rawSapText AI 输出的完整 SAP 协议文本
     * @return SAP 协议格式的响应文本（@@result 或 @@error）
     */
    public String processProtocol(String rawSapText) {
        log.info("[SAP] 收到协议请求:\n{}", rawSapText);

        // 1. 协议格式识别
        SapProtocolBlock block = SapProtocolParser.parseFirst(rawSapText);
        if (block == null) {
            log.warn("[SAP] 协议格式无效");
            return formatError("system", "err",
                    new SapError("FORMAT_ERROR",
                            "协议格式错误，必须以 @@ 开头并以 @@end 结尾",
                            "请构造 @@request:<action>#<id>\\n<JSON>\\n@@end 格式"));
        }

        log.info("[SAP] 解析成功: {}", block);
        String action = block.getAction();
        String id = block.getId();

        // 2. 内置动作：system.capabilities
        if ("system.capabilities".equals(action)) {
            return handleCapabilities(id);
        }

        // 3. 查找 handler
        ActionHandler handler = registry.getHandler(action);
        if (handler == null) {
            return formatError(action, id,
                    new SapError("UNKNOWN_ACTION",
                            "不支持的操作: " + action,
                            "可用操作: " + registry.getAll().keySet() +
                                    "。或调用 @@describe:system.capabilities#<id> @@end 查看完整列表"));
        }

        // 4. 执行（handler 内部做参数校验）
        try {
            SapResult result = handler.execute(id, block.getBody());
            return formatResult(result);
        } catch (ActionValidationException e) {
            log.warn("[SAP] 参数校验失败 action={} id={}: {}", action, id, e.getMessage());
            String fix = e.getFix();
            if (e.getExpectedFormat() != null) {
                fix += " 期望格式: " + e.getExpectedFormat();
            }
            return formatError(action, id, new SapError("INVALID_PARAMS", e.getMessage(), fix));
        } catch (ActionExecutionException e) {
            log.error("[SAP] 业务执行失败 action={} id={}: {}", action, id, e.getMessage(), e);
            return formatError(action, id,
                    new SapError("EXECUTION_ERROR", e.getMessage(), "请检查参数或联系管理员"));
        } catch (Exception e) {
            log.error("[SAP] 未知异常 action={} id={}", action, id, e);
            return formatError(action, id,
                    new SapError("RUNTIME_ERROR", e.getMessage(), "系统内部错误，请联系管理员"));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 内置动作
    // ─────────────────────────────────────────────────────────────────────────

    private String handleCapabilities(String id) {
        List<String> actions = registry.getAll().keySet().stream().sorted().collect(Collectors.toList());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", "success");
        data.put("actions", actions);
        return formatResult(new SapResult("system.capabilities", id, data));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 协议格式化
    // ─────────────────────────────────────────────────────────────────────────

    private String formatResult(SapResult result) {
        try {
            String json = objectMapper.writeValueAsString(result.getData());
            return "@@result:" + result.getAction() + "#" + result.getId() + "\n" + json + "\n@@end";
        } catch (JsonProcessingException e) {
            log.error("[SAP] 序列化结果失败", e);
            return formatError(result.getAction(), result.getId(),
                    new SapError("SERIALIZATION_ERROR", "结果序列化失败", "系统内部错误"));
        }
    }

    private String formatError(String action, String id, SapError error) {
        try {
            Map<String, String> errorMap = new LinkedHashMap<>();
            errorMap.put("code", error.getCode());
            errorMap.put("msg", error.getMsg());
            errorMap.put("fix", error.getFix());
            String json = objectMapper.writeValueAsString(errorMap);
            return "@@error:" + action + "#" + id + "\n" + json + "\n@@end";
        } catch (JsonProcessingException e) {
            // 最终兜底
            return "@@error:" + action + "#" + id + "\n" +
                    "{\"code\":\"SERIALIZATION_ERROR\",\"msg\":\"错误序列化失败\",\"fix\":\"联系管理员\"}\n@@end";
        }
    }
}
