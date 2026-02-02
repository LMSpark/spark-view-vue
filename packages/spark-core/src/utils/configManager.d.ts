export declare function setConfig(newConfig: Record<string, unknown>): void;
export declare function getConfig<T = unknown>(key: string, defaultValue?: T): T;
export declare function clearConfig(): void;
export declare class ConfigManager {
    get<T = unknown>(key: string, defaultValue?: T): T | undefined;
    set<T = unknown>(key: string, value: T): void;
    delete(key: string): void;
    watch(key: string, cb: (value: unknown) => void): () => void;
    setMultiple(obj: Record<string, unknown>): void;
    getAll(): Record<string, unknown>;
    reset(): void;
}
//# sourceMappingURL=configManager.d.ts.map