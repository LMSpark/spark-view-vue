import { Logger } from './logger.js';
export var ErrorType;
(function (ErrorType) {
    ErrorType["NETWORK"] = "network";
    ErrorType["VALIDATION"] = "validation";
    ErrorType["AUTHENTICATION"] = "authentication";
    ErrorType["AUTHORIZATION"] = "authorization";
    ErrorType["BUSINESS_LOGIC"] = "business_logic";
    ErrorType["SYSTEM"] = "system";
    ErrorType["UNKNOWN"] = "unknown";
})(ErrorType || (ErrorType = {}));
export class AppError extends Error {
    constructor(message, type = ErrorType.UNKNOWN, code, context) {
        super(message);
        this.name = 'AppError';
        this.type = type;
        this.code = code;
        this.context = context;
        this.timestamp = Date.now();
    }
}
export class ErrorHandler {
    static handle(error, context) {
        const appError = this.normalizeError(error, context);
        this.logger.error(`[${appError.type}] ${appError.message}`, {
            code: appError.code,
            context: appError.context,
            stack: appError.stack
        });
        this.reportToMonitoring(appError);
        throw appError;
    }
    static normalizeError(error, context) {
        if (error instanceof AppError)
            return error;
        if (error instanceof Error) {
            const type = this.classifyError(error);
            return new AppError(error.message, type, undefined, context);
        }
        const message = typeof error === 'string' ? error : 'Unknown error occurred';
        return new AppError(message, ErrorType.UNKNOWN, undefined, context);
    }
    static classifyError(error) {
        const message = error.message.toLowerCase();
        if (message.includes('network') || message.includes('fetch'))
            return ErrorType.NETWORK;
        if (message.includes('validation') || message.includes('invalid'))
            return ErrorType.VALIDATION;
        if (message.includes('unauthorized') || message.includes('401'))
            return ErrorType.AUTHENTICATION;
        if (message.includes('forbidden') || message.includes('403'))
            return ErrorType.AUTHORIZATION;
        if (error.name === 'TypeError' || error.name === 'ReferenceError')
            return ErrorType.SYSTEM;
        return ErrorType.UNKNOWN;
    }
    static async withRetry(operation, options, context) {
        const opts = options !== null && options !== void 0 ? options : { maxAttempts: 3, delay: 1000, backoff: 'fixed' };
        const { maxAttempts, delay, backoff, retryCondition } = opts;
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                const shouldRetry = !retryCondition || retryCondition(error);
                if (!shouldRetry || attempt === maxAttempts) {
                    this.handle(lastError, Object.assign(Object.assign({}, context), { operation: `${(context === null || context === void 0 ? void 0 : context.operation) || 'unknown'} (attempt ${attempt}/${maxAttempts})` }));
                }
                const delayTime = backoff === 'exponential' ? delay * Math.pow(2, attempt - 1) : delay;
                this.logger.warn(`Operation failed, retrying in ${delayTime}ms (attempt ${attempt}/${maxAttempts})`);
                await this.delay(delayTime);
            }
        }
        throw lastError;
    }
    static getUserFriendlyMessage(error) {
        switch (error.type) {
            case ErrorType.NETWORK:
                return 'Network error occurred, please check your connection and try again';
            case ErrorType.VALIDATION:
                return 'Input validation failed, please check your data';
            case ErrorType.AUTHENTICATION:
                return 'Authentication failed, please log in again';
            case ErrorType.AUTHORIZATION:
                return 'Access denied, insufficient permissions';
            case ErrorType.BUSINESS_LOGIC:
                return error.message || 'Operation failed, please try again later';
            case ErrorType.SYSTEM:
                return 'System error occurred, please try again or contact support';
            default:
                return 'An unknown error occurred, please try again';
        }
    }
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    static reportToMonitoring(error) {
        // keep simple: console for now
        try {
            console.error('Error reported to monitoring:', error);
        }
        catch ( /* ignore */_a) { /* ignore */ }
    }
}
ErrorHandler.logger = Logger('ErrorHandler');
export const handleError = ErrorHandler.handle.bind(ErrorHandler);
export const withRetry = ErrorHandler.withRetry.bind(ErrorHandler);
export const getUserFriendlyMessage = ErrorHandler.getUserFriendlyMessage.bind(ErrorHandler);
