package com.spark.ai.sap.handler;

import com.spark.ai.sap.model.SapResult;

/**
 * SAP 动作处理器接口。
 *
 * <p>每种动作（file.write、db.query 等）实现此接口并注册到 {@link ActionRegistry}。
 * 编排器解析协议后根据 {@code action} 字段路由到对应的 handler。
 *
 * <h3>职责</h3>
 * <ul>
 *   <li>{@link #getAction()} — 返回处理的动作名（如 "file.write"）</li>
 *   <li>{@link #execute(String, String)} — 校验参数 + 执行业务逻辑</li>
 * </ul>
 */
public interface ActionHandler {

    /**
     * 此 handler 负责处理的动作名称。
     *
     * @return 如 "file.write"、"db.query"
     */
    String getAction();

    /**
     * 执行动作。
     *
     * @param requestId 请求 ID（用于回传关联）
     * @param jsonBody  JSON 参数文本
     * @return 执行结果
     * @throws ActionValidationException 参数校验失败时抛出，编排器捕获后生成 @@error
     * @throws ActionExecutionException  业务执行失败时抛出
     */
    SapResult execute(String requestId, String jsonBody)
            throws ActionValidationException, ActionExecutionException;
}
