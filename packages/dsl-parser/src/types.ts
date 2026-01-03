/**
 * DSL AST 类型定义 - 基于 form-create 格式
 */

/**
 * form-create Rule 类型定义
 */
export interface FormCreateRule {
  type: string;
  field?: string;
  title?: string;
  value?: unknown;
  props?: Record<string, unknown>;
  children?: FormCreateRule[];
  validate?: ValidationRule[];
  options?: OptionItem[];
  hidden?: boolean;
  display?: boolean;
  className?: string;
  col?: GridCol;
  [key: string]: unknown;
}

export interface ValidationRule {
  type?: string;
  required?: boolean;
  message?: string;
  trigger?: string | string[];
  min?: number;
  max?: number;
  pattern?: string;
  validator?: string;
}

export interface OptionItem {
  label: string;
  value: unknown;
  disabled?: boolean;
}

export interface GridCol {
  span?: number;
  offset?: number;
  push?: number;
  pull?: number;
}

export interface FormCreateOption {
  form?: Record<string, unknown>;
  row?: Record<string, unknown>;
  submitBtn?: boolean | Record<string, unknown>;
  resetBtn?: boolean | Record<string, unknown>;
  global?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * DSL 文档结构
 */
export interface DSLDocument {
  dslVersion: string;
  page?: PageNode; // 单页面模式（向后兼容）
  pages?: PageNode[]; // 多页面模式
  routes?: RouteConfig[]; // 路由配置
  navigation?: NavigationConfig; // 导航配置
  data?: Record<string, unknown>;
  env?: Record<string, string>;
  theme?: ThemeConfig;
  router?: RouterConfig; // 路由器配置
}

export interface PageNode {
  id: string;
  title: string;
  path?: string;
  meta?: PageMeta;
  rule: FormCreateRule[]; // 使用 form-create rule 数组
  option?: FormCreateOption; // form-create option 配置
}

export interface PageMeta {
  description?: string;
  keywords?: string[];
  author?: string;
}

/**
 * 向后兼容的 ComponentNode (可选)
 */
export interface ComponentNode {
  type: string;
  id?: string;
  props?: Record<string, unknown>;
  children?: Array<ComponentNode | string>;
  condition?: string;
  loop?: LoopConfig;
  hydration?: HydrationStrategy;
}

export interface LoopConfig {
  items: string; // 表达式
  itemVar: string;
  indexVar?: string;
}

export interface HydrationStrategy {
  strategy: 'immediate' | 'idle' | 'visible' | 'interaction' | 'never';
  priority?: 'critical' | 'high' | 'normal' | 'low';
  trigger?: string;
  viewport?: {
    rootMargin?: string;
    threshold?: number;
  };
}

export interface ThemeConfig {
  colors?: Record<string, string>;
  fonts?: Record<string, string>;
}

/**
 * 路由配置
 */
export interface RouteConfig {
  path: string; // 路由路径，如 '/home', '/user/:id'
  name: string; // 路由名称
  component?: string; // 引用 pages 中的页面 id
  pageId?: string; // 页面ID（component的别名）
  meta?: RouteMeta; // 路由元信息
  children?: RouteConfig[]; // 子路由
  redirect?: string; // 重定向
  beforeEnter?: string; // 路由守卫（表达式）
}

export interface RouteMeta {
  title?: string;
  requiresAuth?: boolean;
  roles?: string[];
  icon?: string;
  hidden?: boolean;
  keepAlive?: boolean;
}

/**
 * 导航配置
 */
export interface NavigationConfig {
  header?: NavigationNode; // 顶部导航
  sidebar?: NavigationNode; // 侧边导航
  footer?: NavigationNode; // 底部导航
  breadcrumb?: BreadcrumbConfig; // 面包屑配置
}

export interface NavigationNode {
  type: 'menu' | 'nav' | 'navbar' | 'sidebar' | 'tabs';
  items: NavigationItem[];
  props?: Record<string, unknown>;
}

export interface NavigationItem {
  label: string; // 显示文本
  path?: string; // 路由路径
  route?: string; // 路由名称
  icon?: string; // 图标
  children?: NavigationItem[]; // 子菜单
  meta?: {
    external?: boolean; // 是否外部链接
    target?: string; // 打开方式
    badge?: string; // 徽章
    disabled?: boolean;
  };
}

export interface BreadcrumbConfig {
  enabled: boolean;
  separator?: string;
  home?: string;
}

/**
 * 路由器配置
 */
export interface RouterConfig {
  mode?: 'hash' | 'history' | 'memory';
  base?: string;
  scrollBehavior?: 'auto' | 'smooth' | 'manual';
  linkActiveClass?: string;
  linkExactActiveClass?: string;
}

/**
 * 表达式 AST
 */
export interface ExpressionNode {
  type: 'MemberExpression' | 'CallExpression' | 'Literal' | 'Identifier';
  object?: ExpressionNode;
  property?: ExpressionNode;
  callee?: ExpressionNode;
  arguments?: ExpressionNode[];
  value?: unknown;
  name?: string;
}

/**
 * 解析错误
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public line?: number,
    public column?: number
  ) {
    super(message);
    this.name = 'ParseError';
  }
}
