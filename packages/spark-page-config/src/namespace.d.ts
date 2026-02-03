/**
 * SparkPageConfig 命名空间 - 统一 API
 */
import { createConfigLoader } from './loader';
import { createDynamicRouter, setupDynamicRoutes } from './router';
import { validateRouteConfig, validateRuleConfig, validatePageDataConfig, validateRoutes, validateRules } from './validator';
/**
 * SparkPageConfig 命名空间
 */
export declare const SparkPageConfig: {
    /**
     * 配置加载器
     */
    createLoader: typeof createConfigLoader;
    createConfigLoader: typeof createConfigLoader;
    /**
     * 动态路由
     */
    createRouter: typeof createDynamicRouter;
    createDynamicRouter: typeof createDynamicRouter;
    setupRoutes: typeof setupDynamicRoutes;
    /**
     * 验证器
     */
    validate: {
        route: typeof validateRouteConfig;
        rule: typeof validateRuleConfig;
        pageData: typeof validatePageDataConfig;
        routes: typeof validateRoutes;
        rules: typeof validateRules;
    };
};
/**
 * 默认导出
 */
export default SparkPageConfig;
//# sourceMappingURL=namespace.d.ts.map