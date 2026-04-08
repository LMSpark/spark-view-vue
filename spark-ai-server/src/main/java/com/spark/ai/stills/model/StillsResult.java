package com.spark.ai.stills.model;

import java.util.Map;

/**
 * Stills 协议成功响应载体。
 *
 * <p>序列化为：
 * <pre>
 * @@result:<action>#<id>
 * {"status":"success", ...}
 * @@end
 * </pre>
 */
public class StillsResult {

    private final String action;
    private final String id;
    private final Map<String, Object> data;

    public StillsResult(String action, String id, Map<String, Object> data) {
        this.action = action;
        this.id = id;
        this.data = data;
    }

    public String getAction() { return action; }
    public String getId()     { return id; }
    public Map<String, Object> getData() { return data; }
}
