/**
 * 动态路由注册器 - 支持 SPA 动态路由
 */
import type { Router } from 'vue-router';
import type { Component } from 'vue';
import type { RouteConfig, DynamicRouterOptions, ConfigLoader } from '../types';
/**
 * 动态路由管理器
 */
export declare class DynamicRouter {
    private router;
    private configLoader;
    private pageComponent;
    private registeredRoutes;
    private beforeRegister?;
    private afterRegister?;
    constructor(options: DynamicRouterOptions);
    /**
     * 注册所有路由
     */
    registerRoutes(): Promise<void>;
    /**
     * 注册单个路由
     */
    registerRoute(config: RouteConfig): Promise<void>;
    /**
     * 移除路由
     */
    removeRoute(name: string): void;
    /**
     * 刷新路由（重新加载配置）
     */
    refreshRoutes(): Promise<void>;
    /**
     * 获取已注册路由列表
     */
    getRegisteredRoutes(): string[];
}
/**
 * 创建动态路由管理器
 */
export declare function createDynamicRouter(options: DynamicRouterOptions): DynamicRouter;
/**
 * 设置动态路由（便捷函数）
 */
export declare function setupDynamicRoutes(router: Router, configLoader: ConfigLoader, pageComponent: Component): Promise<DynamicRouter>;
//# sourceMappingURL=index.d.ts.map