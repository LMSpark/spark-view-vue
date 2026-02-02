import type { LogLevel, LoggerApi } from '../types/common.js';
/**
 * Create a logger instance. Prefer this API over any legacy helpers.
 * Signature: Logger(context?: unknown): LoggerApi
 */
export declare function Logger(context?: unknown): LoggerApi;
export declare function createConsoleTransport(_level?: LogLevel): {
    level: LogLevel;
    log(_level: LogLevel, message: string, meta?: unknown): void;
};
export declare function createHttpTransport(endpoint: string, _level?: LogLevel): {
    log(_level: LogLevel, message: string, meta?: unknown): Promise<void>;
};
export declare function createMemoryTransport(storage?: unknown[]): {
    log(level: LogLevel, message: string, meta?: unknown): void;
};
//# sourceMappingURL=logger.d.ts.map