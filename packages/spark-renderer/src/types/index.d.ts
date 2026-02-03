/**
 * 渲染器类型定义 (SOLID原则应用)
 *
 * 类型层次说明：
 * - RuleConfig: 配置文件中的规则格式（来自 @spark-view/spark-page-config）
 * - Rule: 运行时的规则格式（FormCreate 官方类型）
 *
 * 转换流程：
 * 1. 配置加载器读取 rule.json → RuleConfig[]
 * 2. PageRenderer 接收 RuleConfig[] → 转换为 Rule[]
 * 3. 绑定和渲染使用 Rule[]（FormCreate 标准格式）
 */
import type { IDataSet } from '@spark-view/spark-data';
import type { ConfigLoader, RuleConfig } from '@spark-view/spark-page-config';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import type { Rule as FormCreateRule } from '@form-create/element-ui';
/**
 * 页面规则类型（使用 FormCreate 官方类型）
 * 用于运行时的规则绑定和渲染
 *
 * 注意：虽然配置文件使用 RuleConfig，但由于结构兼容，
 * FormCreate 能够正确识别和处理我们的配置格式。
 */
export type Rule = FormCreateRule;
/**
 * FormCreate API 接口
 *
 * 注意：由于 @form-create/element-ui 的 Api 类型导出存在问题，
 * 这里参考官方文档定义核心 API 方法
 *
 * 官方文档：https://www.form-create.com/v3/instance/
 */
export interface FormCreateAPI {
    rule: Rule[];
    formData(): Record<string, unknown>;
    setValue(field: string, value: unknown): void;
    getValue(field: string): unknown;
    el(name: string): HTMLElement | null;
    validate(callback?: (valid: boolean) => void): Promise<boolean>;
    validateField(field: string): Promise<void>;
    submit(): Promise<void>;
    resetFields(): void;
    updateRule(name: string, rule: Partial<Rule>): void;
    updateRules(rules: Record<string, Partial<Rule>>): void;
    [key: string]: unknown;
}
/**
 * 页面脚本运行时上下文接口
 *
 * 作用域：单个动态视图（页面配置）的脚本执行环境
 * 生命周期：页面加载时创建，卸载时销毁
 *
 * 用途：
 * - 为页面脚本（script.js）提供框架能力访问接口
 * - 支持脚本访问 FormCreate API、路由、数据集等
 * - 提供 DOM 查询、数据刷新等常用操作
 *
 * 注意：
 * - 此 Context 是"页面配置"级别，非"应用页面"级别
 * - 在 SPA 架构中，多个 PageContext 可能同时存在（如 KeepAlive 场景）
 * - 遵循 DIP 原则：依赖接口（IDataSet）而非具体类型（DataSet）
 *
 * 典型使用场景：
 * - 页面脚本中通过 window.__pageContext 访问
 * - 事件处理函数中访问当前页面的数据和 API
 */
export interface PageContext {
    $api: FormCreateAPI | null;
    $route: RouteLocationNormalizedLoaded;
    $data: Record<string, unknown>;
    $el: () => HTMLElement | null;
    $query: (selector: string) => HTMLElement | null;
    $queryAll: (selector: string) => NodeListOf<Element>;
    $rebindRules: () => void;
    $refreshData: (key?: string) => Promise<void>;
    $dataSet: IDataSet | null;
}
/**
 * 页面配置（从配置文件加载的原始配置）
 */
export interface PageConfig {
    pageId: string;
    rule: RuleConfig[];
    data: Record<string, unknown>;
    style?: string;
    script?: string;
}
/**
 * 渲染器选项
 */
export interface PageRendererOptions {
    /**
     * 配置加载器
     */
    configLoader?: ConfigLoader;
    /**
     * 页面ID（优先级最高）
     */
    pageId?: string;
    /**
     * 页面配置（直接传入，跳过加载）
     */
    pageConfig?: PageConfig;
    /**
     * FormCreate 选项
     */
    formCreateOptions?: Record<string, unknown>;
    /**
     * 是否启用 CSS 隔离
     */
    enableCssScope?: boolean;
    /**
     * 是否启用 DataSet 自动初始化
     */
    enableDataSet?: boolean;
    /**
     * 页面加载前钩子
     */
    beforeLoad?: (pageId: string) => void | Promise<void>;
    /**
     * 页面加载后钩子
     */
    afterLoad?: (config: PageConfig) => void | Promise<void>;
    /**
     * 错误处理
     */
    onError?: (error: Error) => void;
}
/**
 * Rule 绑定选项
 */
export interface RuleBindingOptions {
    rules: Rule[];
    pageData: Record<string, unknown>;
    pageFunctions: Record<string, Function>;
    dataSet: IDataSet | null;
    formApi: FormCreateAPI | null;
}
//# sourceMappingURL=index.d.ts.map