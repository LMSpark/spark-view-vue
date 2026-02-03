/**
 * 配置验证器
 */
import type { RouteConfig, RuleConfig, PageDataConfig, ValidationError } from '../types';
/**
 * 验证路由配置
 */
export declare function validateRouteConfig(config: RouteConfig): ValidationError[];
/**
 * 验证规则配置
 */
export declare function validateRuleConfig(config: RuleConfig): ValidationError[];
/**
 * 验证页面数据配置
 */
export declare function validatePageDataConfig(config: PageDataConfig): ValidationError[];
/**
 * 批量验证路由配置
 */
export declare function validateRoutes(routes: RouteConfig[]): Map<string, ValidationError[]>;
/**
 * 批量验证规则配置
 */
export declare function validateRules(rules: RuleConfig[]): ValidationError[];
//# sourceMappingURL=index.d.ts.map