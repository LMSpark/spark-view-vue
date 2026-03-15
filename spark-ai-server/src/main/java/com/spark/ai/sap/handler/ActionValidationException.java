package com.spark.ai.sap.handler;

/**
 * 参数校验失败异常。
 *
 * <p>抛出此异常时，编排器会生成 {@code @@error} 协议块并携带 {@code fix} 信息回灌 AI。
 */
public class ActionValidationException extends Exception {

    /** AI 应采取的修正建议 */
    private final String fix;

    /** 期望的参数格式描述 */
    private final String expectedFormat;

    public ActionValidationException(String message, String fix) {
        super(message);
        this.fix = fix;
        this.expectedFormat = null;
    }

    public ActionValidationException(String message, String fix, String expectedFormat) {
        super(message);
        this.fix = fix;
        this.expectedFormat = expectedFormat;
    }

    public String getFix() { return fix; }
    public String getExpectedFormat() { return expectedFormat; }
}
