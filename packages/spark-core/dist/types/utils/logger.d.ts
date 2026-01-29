import type { SparkComponentContext, SparkCapabilityProvider } from '../types/spark-component';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export declare function getLogger(context?: SparkComponentContext): {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
};
export declare function createFileTransport(filePath: string, minLevel?: LogLevel): SparkCapabilityProvider;
export declare function createHttpTransport(url: string, minLevel?: LogLevel): SparkCapabilityProvider;
