package com.spark.ai.stills.handler;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ActionHandler 注册表。
 *
 * <p>Spring 自动注入所有 {@link ActionHandler} 实现，按 {@code getAction()} 建索引。
 * 新增动作只需实现 {@link ActionHandler} 并标 {@code @Component}，无需修改此类。
 */
@Component
public class ActionRegistry {

    private static final Logger log = LoggerFactory.getLogger(ActionRegistry.class);

    private final Map<String, ActionHandler> handlers;

    /**
     * Spring 会自动收集所有 ActionHandler Bean 注入到 List 中。
     */
    public ActionRegistry(List<ActionHandler> handlerList) {
        Map<String, ActionHandler> map = new LinkedHashMap<>();
        for (ActionHandler handler : handlerList) {
            String action = handler.getAction();
            if (map.containsKey(action)) {
                log.warn("[STILLS] 重复注册的 action: {}，后者 {} 将覆盖前者 {}",
                        action, handler.getClass().getSimpleName(),
                        map.get(action).getClass().getSimpleName());
            }
            map.put(action, handler);
            log.info("[STILLS] 注册 ActionHandler: {} → {}", action, handler.getClass().getSimpleName());
        }
        this.handlers = Collections.unmodifiableMap(map);
    }

    /**
     * 根据 action 名查找 handler。
     *
     * @return handler 实例，不存在时返回 null
     */
    public ActionHandler getHandler(String action) {
        return handlers.get(action);
    }

    /**
     * 获取所有已注册的 action 名称（用于 system.capabilities 响应）。
     */
    public Map<String, ActionHandler> getAll() {
        return handlers;
    }
}
