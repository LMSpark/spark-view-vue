/**
 * @spark-view/spark-page-config
 *
 * SPARK 页面配置层 - L2 业务编排层
 * 支持本地/远程配置加载、动态路由注册、配置缓存和验证
 */
export type { RouteConfig, RuleConfig, PageDataConfig, PageScriptConfig, PageConfig, ConfigLoaderOptions, ConfigLoadResult, ConfigLoader, DynamicRouterOptions, ValidationError, ConfigVersion } from './types';
export { PageConfigLoader, createConfigLoader } from './loader';
export { DynamicRouter, createDynamicRouter, setupDynamicRoutes } from './router';
export { validateRouteConfig, validateRuleConfig, validatePageDataConfig, validateRoutes, validateRules } from './validator';
export { SparkPageConfig } from './namespace';
//# sourceMappingURL=index.d.ts.map