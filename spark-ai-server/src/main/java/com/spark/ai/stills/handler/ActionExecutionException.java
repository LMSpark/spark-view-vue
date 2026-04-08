package com.spark.ai.stills.handler;

/**
 * 业务执行失败异常。
 *
 * <p>抛出此异常时，编排器生成 {@code @@error} 协议块。
 * 与 {@link ActionValidationException} 的区别是：此异常代表参数正确但业务层执行失败。
 */
public class ActionExecutionException extends Exception {

    public ActionExecutionException(String message) {
        super(message);
    }

    public ActionExecutionException(String message, Throwable cause) {
        super(message, cause);
    }
}
