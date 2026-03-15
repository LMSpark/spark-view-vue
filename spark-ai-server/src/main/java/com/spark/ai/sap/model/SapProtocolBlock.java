package com.spark.ai.sap.model;

/**
 * SAP/1.0 协议块的解析结果。
 *
 * <p>协议格式：{@code @@<type>:<action>#<id> \n <JSON body> \n @@end}
 *
 * <p>示例：
 * <pre>
 * @@request:file.write#req001
 * {"path":"/tmp/hello.txt","content":"Hello SAP"}
 * @@end
 * </pre>
 */
public class SapProtocolBlock {

    /** 协议块类型（request / result / error / describe） */
    private final String type;

    /** 动作标识（如 file.write、db.query、system.capabilities） */
    private final String action;

    /** 请求 ID（用于多轮关联） */
    private final String id;

    /** JSON body 原始文本 */
    private final String body;

    public SapProtocolBlock(String type, String action, String id, String body) {
        this.type = type;
        this.action = action;
        this.id = id;
        this.body = body;
    }

    public String getType() { return type; }
    public String getAction() { return action; }
    public String getId() { return id; }
    public String getBody() { return body; }

    @Override
    public String toString() {
        return "SapProtocolBlock{type='" + type + "', action='" + action + "', id='" + id + "'}";
    }
}
