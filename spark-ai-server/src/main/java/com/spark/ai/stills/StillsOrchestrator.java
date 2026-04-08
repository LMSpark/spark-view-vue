package com.spark.ai.stills;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.stills.handler.ActionExecutionException;
import com.spark.ai.stills.handler.ActionHandler;
import com.spark.ai.stills.handler.ActionRegistry;
import com.spark.ai.stills.handler.ActionValidationException;
import com.spark.ai.stills.model.StillsError;
import com.spark.ai.stills.model.StillsProtocolBlock;
import com.spark.ai.stills.model.StillsResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Stills 协议编排器 — 拦截、校验、执行的统一入口。
 *
 * <h3>职责</h3>
 * <ol>
 *   <li>解析 AI 输出的 Stills 协议块</li>
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
public class StillsOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(StillsOrchestrator.class);

    private final ActionRegistry registry;
    private final ObjectMapper objectMapper;

    public StillsOrchestrator(ActionRegistry registry, ObjectMapper objectMapper) {
        this.registry = registry;
        this.objectMapper = objectMapper;
    }

    /**
     * 处理一段 Stills 协议文本。
     *
     * <p>当前编排入口只接受单个协议块；如果输入里包含多个块，会直接返回
     * {@code INVALID_PROTOCOL}，避免前后端对多块执行语义产生分叉。
     *
     * @param rawText AI 输出的完整 Stills 协议文本
     * @return Stills 协议格式的响应文本（@@result 或 @@error）
     */
    public String processProtocol(String rawText) {
        log.info("[STILLS] 收到协议请求:\n{}", rawText);

        // 1. 协议格式识别
        List<StillsProtocolBlock> blocks = StillsProtocolParser.parseAll(rawText);
        if (blocks.isEmpty()) {
            log.warn("[STILLS] 协议格式无效");
            return formatError("system", "err",
                    new StillsError("FORMAT_ERROR",
                            "协议格式错误，必须以 @@ 开头并以 @@end 结尾",
                            "请构造 @@request:<action>#<id>\\n<JSON>\\n@@end 格式"));
        }

        if (blocks.size() > 1) {
            log.warn("[STILLS] 协议块数量非法: {}", blocks.size());
            return formatError("system", "multi",
                    new StillsError("INVALID_PROTOCOL",
                            "一次只允许一个 Stills 协议块",
                            "请只保留一个 @@request:<action>#<id> 或 @@describe:<action>#<id> 块"));
        }

        StillsProtocolBlock block = blocks.get(0);

        log.info("[STILLS] 解析成功: {}", block);
        String type = block.getType();
        String action = block.getAction();
        String id = block.getId();

        String typeValidationError = validateProtocolType(type, action, id);
        if (typeValidationError != null) {
            return typeValidationError;
        }

        // 2. 内置动作：system.capabilities
        if ("describe".equals(type) && "system.capabilities".equals(action)) {
            return handleCapabilities(id);
        }

        // 3. 查找 handler（describe 和 request 统一路由到 handler）
        ActionHandler handler = registry.getHandler(action);
        if (handler == null) {
            return formatError(action, id,
                    new StillsError("UNKNOWN_ACTION",
                            "不支持的操作: " + action,
                            "可用操作: " + registry.getAll().keySet() +
                                    "。或调用 @@describe:system.capabilities#<id> @@end 查看完整列表"));
        }

        // 4. 执行（handler 内部做参数校验）
        try {
            StillsResult result = handler.execute(id, block.getBody());
            return formatResult(result);
        } catch (ActionValidationException e) {
            log.warn("[STILLS] 参数校验失败 action={} id={}: {}", action, id, e.getMessage());
            String fix = e.getFix();
            if (e.getExpectedFormat() != null) {
                fix += " 期望格式: " + e.getExpectedFormat();
            }
            return formatError(action, id, new StillsError("INVALID_PARAMS", e.getMessage(), fix));
        } catch (ActionExecutionException e) {
            log.error("[STILLS] 业务执行失败 action={} id={}: {}", action, id, e.getMessage(), e);
            return formatError(action, id,
                    new StillsError("EXECUTION_ERROR", e.getMessage(), "请检查参数或联系管理员"));
        } catch (Exception e) {
            log.error("[STILLS] 未知异常 action={} id={}", action, id, e);
            return formatError(action, id,
                    new StillsError("RUNTIME_ERROR", e.getMessage(), "系统内部错误，请联系管理员"));
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
        return formatResult(new StillsResult("system.capabilities", id, data));
    }

    private String validateProtocolType(String type, String action, String id) {
        if (!"request".equals(type) && !"describe".equals(type)) {
            return formatError(action, id,
                    new StillsError("INVALID_TYPE",
                            "不支持的协议类型: " + type,
                            "仅允许 @@request:<action>#<id> 发起操作，或使用 @@describe:<action>#<id> 查询信息"));
        }

        if ("describe".equals(type) && !"system.capabilities".equals(action)) {
            return formatError(action, id,
                new StillsError("INVALID_PROTOCOL",
                    "describe 类型仅允许用于 system.capabilities",
                    "请改为 @@request:" + action + "#<id> 调用真实动作"));
        }

        if ("request".equals(type) && "system.capabilities".equals(action)) {
            return formatError(action, id,
                new StillsError("INVALID_PROTOCOL",
                    "system.capabilities 必须使用 describe 类型",
                    "请改为 @@describe:system.capabilities#<id>"));
        }

        return null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 协议格式化
    // ─────────────────────────────────────────────────────────────────────────

    private String formatResult(StillsResult result) {
        try {
            String json = objectMapper.writeValueAsString(result.getData());
            return "@@result:" + result.getAction() + "#" + result.getId() + "\n" + json + "\n@@end";
        } catch (JsonProcessingException e) {
            log.error("[STILLS] 序列化结果失败", e);
            return formatError(result.getAction(), result.getId(),
                    new StillsError("SERIALIZATION_ERROR", "结果序列化失败", "系统内部错误"));
        }
    }

    private String formatError(String action, String id, StillsError error) {
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
