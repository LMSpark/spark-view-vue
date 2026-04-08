package com.spark.ai.stills.model;

/**
 * Stills 协议错误响应载体。
 *
 * <p>序列化为：
 * <pre>
 * @@error:<action>#<id>
 * {"code":"INVALID_PARAMS","msg":"缺失必填参数: path","fix":"请补充 path 字段后重发"}
 * @@end
 * </pre>
 */
public class StillsError {

    private final String code;
    private final String msg;
    private final String fix;

    public StillsError(String code, String msg, String fix) {
        this.code = code;
        this.msg = msg;
        this.fix = fix;
    }

    public String getCode() { return code; }
    public String getMsg()  { return msg; }
    public String getFix()  { return fix; }
}
