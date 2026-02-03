/**
 * 配置加载器 - 支持本地/远程配置加载
 */
import type { ConfigLoader, ConfigLoaderOptions, ConfigLoadResult, RouteConfig, PageConfig, RuleConfig, PageDataConfig, PageScriptConfig } from '../types';
/**
 * 配置加载器实现
 */
export declare class PageConfigLoader implements ConfigLoader {
    private options;
    private cache;
    constructor(options?: Partial<ConfigLoaderOptions>);
    /**
     * 加载路由配置
     */
    loadRoutes(): Promise<ConfigLoadResult<RouteConfig[]>>;
    /**
     * 加载页面配置（rule + data + script）
     */
    loadPageConfig(pageId: string): Promise<ConfigLoadResult<PageConfig>>;
    /**
     * 加载页面规则
     */
    loadRule(pageId: string): Promise<ConfigLoadResult<RuleConfig[]>>;
    /**
     * 加载页面数据
     */
    loadPageData(pageId: string): Promise<ConfigLoadResult<PageDataConfig>>;
    /**
     * 加载页面脚本
     */
    loadScript(pageId: string): Promise<ConfigLoadResult<PageScriptConfig>>;
    /**
     * 清除缓存
     */
    clearCache(key?: string): void;
    /**
     * 获取缓存统计
     */
    getCacheStats(): {
        size: number;
        keys: string[];
    };
    /**
     * 通用加载逻辑（带缓存）
     */
    private load;
    /**
     * 获取缓存数据
     */
    private getFromCache;
    /**
     * 设置缓存
     */
    private setCache;
    /**
     * 加载路由配置
     */
    private fetchRoutes;
    /**
     * 加载页面规则
     */
    private fetchRule;
    /**
     * 加载页面数据
     */
    private fetchPageData;
    /**
     * 加载页面脚本
     */
    private fetchScript;
    /**
     * 从远程加载 JSON 配置
     */
    private fetchFromRemote;
    /**
     * 从本地加载 JSON 配置
     */
    private fetchFromLocal;
    /**
     * 从远程加载脚本
     */
    private fetchScriptFromRemote;
    /**
     * 从本地加载脚本
     */
    private fetchScriptFromLocal;
}
/**
 * 创建配置加载器
 */
export declare function createConfigLoader(options?: Partial<ConfigLoaderOptions>): ConfigLoader;
//# sourceMappingURL=index.d.ts.map