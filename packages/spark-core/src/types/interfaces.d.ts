export interface IComponentDefinition {
    type: string;
    name?: string;
    version?: string;
}
export interface IComponentRegistry {
    register(def: IComponentDefinition): void;
    unregister(type: string): boolean;
    get(type: string): IComponentDefinition | undefined;
    has(type: string): boolean;
    getAllTypes(): string[];
}
export interface IComponentContext {
    id: string;
    type: string;
    parentId?: string;
    providers: Record<string, unknown>;
    consumers: Record<string, unknown>;
}
export interface IComponentManager {
    registerComponent(def: IComponentDefinition): void;
    createContext(cfg: {
        type: string;
        id?: string;
    }, parentId?: string): IComponentContext;
    destroyContext(id: string): void;
    getContext(id: string): IComponentContext | undefined;
    getAllContexts(): IComponentContext[];
}
export interface ICapabilityProvider {
    name: string;
    version?: string;
    interface?: unknown;
    implementation?: unknown;
}
export interface ICapabilityManager {
    registerConnector(name: string, impl: unknown): void;
    connect(provider: ICapabilityProvider, consumer: unknown): boolean;
    disconnect(providerName: string, consumer: unknown): void;
}
export interface ILogger {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}
export interface ISparkPlugin {
    name: string;
    install(manager: IComponentManager): void | Promise<void>;
    uninstall?(manager: IComponentManager): void | Promise<void>;
}
//# sourceMappingURL=interfaces.d.ts.map