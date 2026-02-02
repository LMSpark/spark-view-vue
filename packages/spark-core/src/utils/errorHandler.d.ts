export interface RetryOptions {
    maxAttempts: number;
    delay: number;
    backoff: 'fixed' | 'exponential';
    retryCondition?: (error: unknown) => boolean;
}
export interface ErrorContext {
    operation?: string;
    component?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
}
export declare enum ErrorType {
    NETWORK = "network",
    VALIDATION = "validation",
    AUTHENTICATION = "authentication",
    AUTHORIZATION = "authorization",
    BUSINESS_LOGIC = "business_logic",
    SYSTEM = "system",
    UNKNOWN = "unknown"
}
export declare class AppError extends Error {
    readonly type: ErrorType;
    readonly code?: string;
    readonly context?: ErrorContext;
    readonly timestamp: number;
    constructor(message: string, type?: ErrorType, code?: string, context?: ErrorContext);
}
export declare class ErrorHandler {
    private static logger;
    static handle(error: unknown, context?: ErrorContext): never;
    static normalizeError(error: unknown, context?: ErrorContext): AppError;
    private static extractErrorCode;
    private static classifyError;
    static withRetry<T>(operation: () => Promise<T>, options?: RetryOptions, context?: ErrorContext): Promise<T>;
    static getUserFriendlyMessage(error: AppError): string;
    private static delay;
    private static reportToMonitoring;
}
export declare const handleError: typeof ErrorHandler.handle;
export declare const withRetry: typeof ErrorHandler.withRetry;
export declare const getUserFriendlyMessage: typeof ErrorHandler.getUserFriendlyMessage;
//# sourceMappingURL=errorHandler.d.ts.map