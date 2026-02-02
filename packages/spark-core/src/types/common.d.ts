export type AnyFunction = (...args: unknown[]) => unknown;
/**
 * A capability interface describes shape of available members for a capability.
 * Values are typically functions or boolean flags indicating availability.
 */
export type CapabilityInterface = Record<string, AnyFunction | boolean | unknown>;
/** Implementation payload carried by providers/consumers */
export type Implementation = Record<string, unknown>;
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LoggerApi {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
}
export interface CapabilityProvider<TInterface = CapabilityInterface, TImpl = Implementation> {
    name: string;
    version?: string;
    interface?: TInterface;
    implementation?: TImpl;
}
export interface CapabilityConsumer<TInterface = CapabilityInterface, TImpl = Implementation> {
    capabilityName: string;
    interface?: TInterface;
    implementation?: TImpl | undefined;
    minVersion?: string;
    onProvide?: (prov: CapabilityProvider<TInterface, TImpl>) => void;
}
export interface Transport {
    level?: LogLevel;
    log: (level: LogLevel, message: string, meta?: unknown) => void | Promise<void>;
}
//# sourceMappingURL=common.d.ts.map