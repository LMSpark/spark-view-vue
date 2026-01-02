# 10. 路由系统与SPA架构

**系列文章目录**  
[← 上一篇：09. 未来路线图](./09-future-roadmap.md)

---

## 本文概览

本文详细介绍 SPARK VIEW 路由系统的设计与实现，包括：

- 🎯 **路由系统架构设计**
- 🔧 **DSL 路由配置语法**
- 🚀 **Vue Router 代码生成**
- 🌐 **SSR 路由匹配机制**
- ✨ **导航组件自动生成**
- 🧪 **测试策略与验证**

---

## 一、为什么需要路由系统？

### 1.1 单页面应用的局限

SPARK VIEW 最初只支持单页面模式，这在简单场景下足够，但面临以下问题：

```yaml
# 单页面模式 - 所有功能挤在一个页面
page:
  id: main
  layout:
    type: div
    children:
      - type: header
        # ...
      - type: main
        # ...
      - type: footer
        # ...
```

**问题**：
- ❌ 无法实现多页面导航
- ❌ 无法根据 URL 展示不同内容
- ❌ 不支持浏览器前进/后退
- ❌ 无法进行页面级别的代码分割

### 1.2 升级为 SPA 架构

引入路由系统后，支持真正的单页应用架构：

```yaml
# 多页面模式 - 基于路由的页面管理
pages:
  - id: home
    layout: { ... }
  - id: about
    layout: { ... }
  - id: user-detail
    layout: { ... }

routes:
  - path: /
    name: home
    pageId: home
  - path: /about
    name: about
    pageId: about
  - path: /user/:id
    name: user-detail
    pageId: user-detail
```

**优势**：
- ✅ 支持多页面导航
- ✅ URL 驱动的视图切换
- ✅ 懒加载 & 代码分割
- ✅ SEO 友好（SSR 支持）

---

## 二、DSL 路由配置

### 2.1 类型定义

在 `packages/dsl-parser/src/types.ts` 中扩展了 7 个新接口：

```typescript
// 路由配置
export interface RouteConfig {
  path: string;                      // 路由路径
  name?: string;                     // 路由名称
  component?: string;                // 组件名
  pageId?: string;                   // 页面 ID（引用 pages 中的页面）
  meta?: RouteMeta;                  // 元信息
  children?: RouteConfig[];          // 嵌套路由
  redirect?: string;                 // 重定向
  beforeEnter?: string;              // 路由守卫
}

// 路由元信息
export interface RouteMeta {
  title?: string;                    // 页面标题
  requiresAuth?: boolean;            // 是否需要认证
  roles?: string[];                  // 允许的角色
  icon?: string;                     // 图标
  hidden?: boolean;                  // 是否隐藏
  keepAlive?: boolean;               // 是否缓存
}

// 导航配置
export interface NavigationConfig {
  header?: NavigationNode;           // 头部导航
  sidebar?: NavigationNode;          // 侧边栏
  footer?: NavigationNode;           // 底部导航
  breadcrumb?: BreadcrumbConfig;     // 面包屑
}

// 导航节点
export interface NavigationNode {
  type: 'menu' | 'nav' | 'navbar' | 'sidebar' | 'tabs';
  items?: NavigationItem[];
  props?: Record<string, unknown>;
}

// 导航项
export interface NavigationItem {
  label: string;                     // 显示文本
  path: string;                      // 链接路径
  icon?: string;                     // 图标
  children?: NavigationItem[];       // 子菜单
  meta?: {
    external?: boolean;              // 外部链接
    target?: string;                 // 打开方式
    badge?: string;                  // 徽章
    disabled?: boolean;              // 是否禁用
  };
}

// 路由器配置
export interface RouterConfig {
  mode?: 'hash' | 'history' | 'memory';
  base?: string;
  scrollBehavior?: {
    savePosition?: boolean;
    smooth?: boolean;
  };
  linkActiveClass?: string;
  linkExactActiveClass?: string;
}

// 面包屑配置
export interface BreadcrumbConfig {
  enabled: boolean;
  separator?: string;
  home: {
    label: string;
    path: string;
  };
}
```

### 2.2 完整 DSL 示例

```yaml
# 定义多个页面
pages:
  - id: home
    title: 首页
    layout:
      type: div
      children:
        - type: h1
          props:
            text: 欢迎使用 SPARK VIEW

  - id: about
    title: 关于
    layout:
      type: div
      children:
        - type: h1
          props:
            text: 关于我们

  - id: user-profile
    title: 用户资料
    layout:
      type: div
      children:
        - type: h1
          props:
            text: 用户资料

# 路由配置
routes:
  - path: /
    name: home
    pageId: home
    meta:
      title: 首页
      icon: home

  - path: /about
    name: about
    pageId: about
    meta:
      title: 关于
      icon: info

  - path: /user/:id
    name: user-profile
    pageId: user-profile
    meta:
      title: 用户资料
      requiresAuth: true
      roles: [user, admin]

# 导航配置
navigation:
  header:
    type: navbar
    items:
      - label: 首页
        path: /
        icon: home
      - label: 产品
        path: /products
        icon: box
        children:
          - label: 服务 A
            path: /products/a
          - label: 服务 B
            path: /products/b
      - label: 关于
        path: /about
        icon: info

  breadcrumb:
    enabled: true
    separator: /
    home:
      label: 首页
      path: /

# 路由器配置
router:
  mode: history
  base: /app/
  scrollBehavior:
    savePosition: true
    smooth: true
  linkActiveClass: router-link-active
  linkExactActiveClass: router-link-exact-active
```

---

## 三、Parser 路由验证

### 3.1 验证逻辑

在 `packages/dsl-parser/src/parser.ts` 中添加了三个验证方法：

```typescript
/**
 * 验证路由配置
 */
private validateRoutes(ast: DSLDocument): void {
  if (!ast.routes || ast.routes.length === 0) {
    return;
  }

  // 收集所有页面 ID
  const pageIds = new Set(ast.pages?.map((p) => p.id) || []);

  // 验证每个路由
  for (const route of ast.routes) {
    this.validateRoutePath(route);
    this.validateRouteReferences(route, pageIds);
  }
}

/**
 * 验证路由路径格式
 */
private validateRoutePath(route: RouteConfig): void {
  if (!route.path.startsWith('/')) {
    throw new Error(`Route path must start with /: ${route.path}`);
  }

  // 递归验证子路由
  if (route.children) {
    for (const child of route.children) {
      this.validateRoutePath(child);
    }
  }
}

/**
 * 验证路由引用的页面存在
 */
private validateRouteReferences(
  route: RouteConfig,
  pageIds: Set<string>
): void {
  if (route.pageId && !pageIds.has(route.pageId)) {
    throw new Error(
      `Route "${route.path}" references non-existent page "${route.pageId}"`
    );
  }

  // 递归验证子路由
  if (route.children) {
    for (const child of route.children) {
      this.validateRouteReferences(child, pageIds);
    }
  }
}
```

### 3.2 验证规则

| 规则 | 说明 | 错误示例 |
|------|------|---------|
| **路径格式** | 必须以 `/` 开头 | `path: home` ❌ |
| **页面引用** | `pageId` 必须在 `pages` 中存在 | `pageId: nonexistent` ❌ |
| **嵌套路由** | 子路由路径可以是相对路径 | `children: [{ path: profile }]` ✅ |
| **动态参数** | 支持 `:param` 语法 | `path: /user/:id` ✅ |

---

## 四、RouterGenerator 代码生成

### 4.1 生成器架构

`packages/dsl-compiler/src/router-generator.ts` 负责生成 Vue Router 代码：

```typescript
export interface RouterCodeOutput {
  routerCode: string;           // router.js 配置代码
  navigationComponent?: string; // 导航组件 SFC 代码
}

export class RouterGenerator {
  /**
   * 生成路由器配置代码
   */
  generateRouterConfig(
    routes: RouteConfig[],
    routerConfig?: RouterConfig
  ): RouterCodeOutput {
    const mode = routerConfig?.mode || 'history';
    const base = routerConfig?.base || '/';

    // 导入语句
    const imports = this.getRouterModeImport(mode);

    // 路由数组
    const routesCode = routes
      .map((route) => this.generateRouteCode(route))
      .join(',\n');

    // 路由器选项
    const routerOptions = this.generateRouterOptions(routerConfig);

    // 守卫
    const guards = this.generateRouterGuards(routes);

    return {
      routerCode: `
import { createRouter, ${imports} } from 'vue-router';

const routes = [
${routesCode}
];

const router = createRouter({
  history: ${this.getRouterModeCode(mode, base)},
  routes,
  ${routerOptions}
});

${guards}

export default router;
      `.trim(),
    };
  }

  /**
   * 生成路由对象代码
   */
  private generateRouteCode(route: RouteConfig, indent = 1): string {
    const spaces = '  '.repeat(indent);
    const parts: string[] = [];

    parts.push(`${spaces}{`);
    parts.push(`${spaces}  path: '${route.path}',`);

    if (route.name) {
      parts.push(`${spaces}  name: '${route.name}',`);
    }

    // 懒加载组件
    const componentId = route.pageId || route.component;
    if (componentId) {
      parts.push(
        `${spaces}  component: () => import('./pages/${componentId}.vue'),`
      );
    }

    // 元信息
    if (route.meta) {
      parts.push(`${spaces}  meta: ${JSON.stringify(route.meta, null, 2)},`);
    }

    // 子路由
    if (route.children && route.children.length > 0) {
      parts.push(`${spaces}  children: [`);
      const childrenCode = route.children
        .map((child) => this.generateRouteCode(child, indent + 2))
        .join(',\n');
      parts.push(childrenCode);
      parts.push(`${spaces}  ],`);
    }

    // 重定向
    if (route.redirect) {
      parts.push(`${spaces}  redirect: '${route.redirect}',`);
    }

    parts.push(`${spaces}}`);

    return parts.join('\n');
  }

  /**
   * 生成路由守卫代码
   */
  private generateRouterGuards(routes: RouteConfig[]): string {
    const guards: string[] = [];

    // 认证守卫
    if (this.hasRoutesWithMeta(routes, 'requiresAuth')) {
      guards.push(`
// 认证守卫
router.beforeEach((to, from, next) => {
  if (to.meta.requiresAuth && !isAuthenticated()) {
    next({ name: 'login' });
  } else {
    next();
  }
});
      `);
    }

    // 标题守卫
    if (this.hasRoutesWithMeta(routes, 'title')) {
      guards.push(`
// 更新页面标题
router.afterEach((to) => {
  if (to.meta.title) {
    document.title = to.meta.title;
  }
});
      `);
    }

    return guards.join('\n');
  }
}
```

### 4.2 生成代码示例

输入 DSL：

```yaml
routes:
  - path: /
    name: home
    pageId: home
    meta:
      title: 首页

  - path: /admin
    name: admin
    pageId: admin
    meta:
      title: 管理面板
      requiresAuth: true
```

生成的 `router.js`：

```javascript
import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('./pages/home.vue'),
    meta: {
      "title": "首页"
    }
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('./pages/admin.vue'),
    meta: {
      "title": "管理面板",
      "requiresAuth": true
    }
  }
];

const router = createRouter({
  history: createWebHistory('/'),
  routes,
});

// 认证守卫
router.beforeEach((to, from, next) => {
  if (to.meta.requiresAuth && !isAuthenticated()) {
    next({ name: 'login' });
  } else {
    next();
  }
});

// 更新页面标题
router.afterEach((to) => {
  if (to.meta.title) {
    document.title = to.meta.title;
  }
});

export default router;
```

---

## 五、IR 路由节点

### 5.1 扩展 IR 类型

在 `packages/dsl-compiler/src/ir-generator.ts` 中扩展了 IRNode：

```typescript
export interface IRNode {
  type: 'element' | 'text' | 'expression' | 'condition' | 'loop' | 
        'router' | 'navigation';  // 新增 router 和 navigation
  
  // 原有字段 ...
  
  // 路由相关
  routes?: RouteIRNode[];
  routerMode?: 'hash' | 'history' | 'memory';
  
  // 导航相关
  navigationItems?: NavigationIRNode[];
  navigationType?: 'navbar' | 'sidebar' | 'tabs';
}

export interface RouteIRNode {
  path: string;
  name?: string;
  component: string;
  meta?: Record<string, unknown>;
  children?: RouteIRNode[];
  redirect?: string;
}

export interface NavigationIRNode {
  label: string;
  path: string;
  icon?: string;
  children?: NavigationIRNode[];
  external?: boolean;
  badge?: string;
}
```

### 5.2 生成方法

```typescript
/**
 * 生成路由 IR 节点
 */
generateRouterIR(dsl: DSLDocument): IRNode | null {
  if (!dsl.routes || dsl.routes.length === 0) {
    return null;
  }

  return {
    type: 'router',
    routes: dsl.routes.map((route) => this.transformRoute(route)),
    routerMode: dsl.router?.mode || 'history',
  };
}

/**
 * 生成导航 IR 节点
 */
generateNavigationIR(dsl: DSLDocument): IRNode | null {
  if (!dsl.navigation?.header) {
    return null;
  }

  const navConfig = dsl.navigation.header;
  const transformNavItem = (item: any): NavigationIRNode => ({
    label: item.label,
    path: item.path,
    icon: item.icon,
    external: item.meta?.external,
    badge: item.meta?.badge,
    children: item.children?.map(transformNavItem),
  });

  return {
    type: 'navigation',
    navigationItems: navConfig.items?.map(transformNavItem),
    navigationType: navConfig.type === 'navbar' ? 'navbar' : 'sidebar',
  };
}
```

---

## 六、SSR 路由渲染

### 6.1 路由匹配

SSR 服务器需要根据请求路径渲染对应页面：

```typescript
// packages/ssr-server/src/render.ts

export interface RenderContext {
  data?: Record<string, unknown>;
  env?: Record<string, string>;
  routePath?: string;  // 新增：当前路由路径
}

export interface RenderOutput {
  html: string;
  hydrationHints: unknown[];
  criticalCSS?: string;
  routerConfig?: string;         // 新增：路由配置代码
  navigationComponent?: string;  // 新增：导航组件代码
}

async render(dslContent: string, context: RenderContext = {}): Promise<RenderOutput> {
  const ast = parse(dslContent, 'yaml');
  const compileOutput = compile(ast, { extractCSS: true });

  // 根据路径选择页面
  let targetPage = this.getTargetPage(ast, context.routePath);

  // 创建渲染上下文
  const renderContext = {
    data: { ...ast.data, ...context.data },
    env: { ...ast.env, ...context.env },
    currentRoute: context.routePath || '/',
    page: targetPage,
  };

  const app = renderModule.createApp(renderContext);
  const html = await renderToString(app);

  return {
    html,
    hydrationHints: compileOutput.hydrationHints,
    criticalCSS: compileOutput.criticalCSS,
    routerConfig: compileOutput.routerConfig,
    navigationComponent: compileOutput.navigationComponent,
  };
}
```

### 6.2 路径匹配算法

```typescript
/**
 * 简单的路由匹配逻辑
 */
private matchRoute(routes: any[], path: string): any {
  for (const route of routes) {
    // 精确匹配
    if (route.path === path) {
      return route;
    }

    // 动态参数匹配（简化版）
    if (route.path.includes(':')) {
      const pattern = route.path.replace(/:[^/]+/g, '[^/]+');
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(path)) {
        return route;
      }
    }

    // 递归检查子路由
    if (route.children) {
      const childMatch = this.matchRoute(route.children, path);
      if (childMatch) return childMatch;
    }
  }

  return null;
}
```

### 6.3 SSR 渲染流程

```
请求 /user/123
    ↓
1. 解析 DSL
    ↓
2. 匹配路由 /user/:id → user-detail 页面
    ↓
3. 编译对应页面组件
    ↓
4. SSR 渲染 HTML
    ↓
5. 返回 HTML + 水合提示 + 路由配置
```

---

## 七、测试验证

### 7.1 测试结构

在 `packages/dsl-parser/tests/router.test.ts` 中包含 16 个测试用例：

```typescript
describe('路由解析和验证', () => {
  it('应该解析基本路由配置', () => { ... });
  it('应该解析嵌套路由', () => { ... });
  it('应该解析路由元信息', () => { ... });
  it('应该验证路由路径格式', () => { ... });
  it('应该验证路由引用的页面存在', () => { ... });
  it('应该支持动态路由参数', () => { ... });
  it('应该解析路由重定向', () => { ... });
});

describe('导航配置解析', () => {
  it('应该解析基本导航配置', () => { ... });
  it('应该解析嵌套导航菜单', () => { ... });
  it('应该解析导航项元信息', () => { ... });
});

describe('路由器配置解析', () => {
  it('应该解析路由器模式配置', () => { ... });
  it('应该解析滚动行为配置', () => { ... });
  it('应该解析链接激活类名配置', () => { ... });
});

describe('面包屑配置解析', () => {
  it('应该解析面包屑配置', () => { ... });
});
```

### 7.2 运行测试

```bash
# 运行所有测试
pnpm test

# 仅运行路由测试
pnpm test router.test.ts

# 监听模式
pnpm test --watch
```

---

## 八、实战演练

### 8.1 创建完整 SPA 应用

```yaml
# spa-app.dsl.yaml

# 页面定义
pages:
  - id: home
    layout:
      type: div
      props:
        class: home-page
      children:
        - type: h1
          props:
            text: 欢迎使用 SPARK VIEW

  - id: products
    layout:
      type: div
      props:
        class: products-page
      children:
        - type: h1
          props:
            text: 产品列表

  - id: product-detail
    layout:
      type: div
      props:
        class: product-detail-page
      children:
        - type: h1
          props:
            text: "{{ data.product.name }}"

  - id: admin
    layout:
      type: div
      props:
        class: admin-page
      children:
        - type: h1
          props:
            text: 管理面板

# 路由配置
routes:
  - path: /
    name: home
    pageId: home
    meta:
      title: 首页
      icon: home

  - path: /products
    name: products
    pageId: products
    meta:
      title: 产品
      icon: box

  - path: /products/:id
    name: product-detail
    pageId: product-detail
    meta:
      title: 产品详情

  - path: /admin
    name: admin
    pageId: admin
    meta:
      title: 管理面板
      requiresAuth: true
      roles: [admin]

# 导航
navigation:
  header:
    type: navbar
    items:
      - label: 首页
        path: /
        icon: home
      - label: 产品
        path: /products
        icon: box
      - label: 管理
        path: /admin
        icon: shield
        meta:
          badge: Admin Only

# 路由器
router:
  mode: history
  base: /
  scrollBehavior:
    savePosition: true
    smooth: true

# 数据
data:
  product:
    name: SPARK VIEW Pro
    price: 999
```

### 8.2 使用 CLI 编译

```bash
# 编译 DSL
spark-view compile spa-app.dsl.yaml --output dist/

# 输出文件：
# dist/pages/home.vue
# dist/pages/products.vue
# dist/pages/product-detail.vue
# dist/pages/admin.vue
# dist/router.js
# dist/components/Navbar.vue
```

---

## 九、最佳实践

### 9.1 路由组织

```
✅ 推荐结构：
routes:
  - path: /                    # 首页
  - path: /about              # 关于页
  - path: /products           # 产品列表
  - path: /products/:id       # 产品详情
  - path: /user               # 用户中心
    children:
      - path: profile         # /user/profile
      - path: settings        # /user/settings
  - path: /admin              # 管理后台
    meta:
      requiresAuth: true

❌ 避免：
routes:
  - path: home               # 缺少前导 /
  - path: /product/:id/:name # 过多参数
  - path: /*                 # 通配符应放最后
```

### 9.2 页面命名规范

```yaml
pages:
  - id: home              # ✅ 短小精悍
  - id: user-profile      # ✅ kebab-case
  - id: productDetail     # ❌ 避免 camelCase
  - id: Product_List      # ❌ 避免下划线
```

### 9.3 元信息使用

```yaml
routes:
  - path: /admin
    meta:
      title: 管理面板         # ✅ 页面标题
      requiresAuth: true     # ✅ 认证标记
      roles: [admin]         # ✅ 角色控制
      keepAlive: true        # ✅ 组件缓存
      icon: shield           # ✅ 菜单图标
```

---

## 十、性能优化

### 10.1 懒加载

路由组件默认使用懒加载：

```javascript
// 自动生成
{
  path: '/products',
  component: () => import('./pages/products.vue')  // 懒加载
}
```

### 10.2 路由预加载

对于重要页面，可以预加载：

```javascript
// 预加载下一个可能访问的页面
router.beforeEach((to, from, next) => {
  if (to.name === 'products') {
    // 预加载产品详情页
    import('./pages/product-detail.vue');
  }
  next();
});
```

### 10.3 缓存策略

```yaml
routes:
  - path: /list
    name: list
    pageId: list
    meta:
      keepAlive: true  # 启用组件缓存
```

---

## 十一、问题排查

### 11.1 路由不匹配

**症状**：访问 `/user/123` 显示 404

**原因**：
1. 路由路径错误
2. 参数格式不匹配
3. 路由顺序问题

**解决**：

```yaml
# ❌ 错误
routes:
  - path: /user/:id
    pageId: user-detail
  - path: /user/new        # 永远不会匹配
    pageId: user-new

# ✅ 正确
routes:
  - path: /user/new        # 特定路径在前
    pageId: user-new
  - path: /user/:id        # 动态路径在后
    pageId: user-detail
```

### 11.2 导航不显示

**症状**：页面显示正常但导航栏空白

**原因**：
1. 导航配置语法错误
2. `items` 数组为空
3. CSS 样式问题

**解决**：

```yaml
# ❌ 错误
navigation:
  header:
    type: navbar
    # 缺少 items

# ✅ 正确
navigation:
  header:
    type: navbar
    items:
      - label: 首页
        path: /
```

### 11.3 SSR 路由渲染错误

**症状**：SSR 渲染的页面不正确

**原因**：
1. `routePath` 参数未传递
2. 路由匹配逻辑错误

**解决**：

```typescript
// 确保传递 routePath
const output = await renderer.render(dslContent, {
  routePath: req.path  // ← 关键
});
```

---

## 十二、总结

### 12.1 架构优势

| 特性 | 说明 |
|------|------|
| **声明式配置** | YAML 描述路由，无需手写 Vue Router 代码 |
| **自动生成** | 从 DSL 生成完整路由配置和导航组件 |
| **类型安全** | TypeScript 类型定义确保配置正确 |
| **SSR 友好** | 服务端路由匹配支持 |
| **懒加载** | 自动按路由拆分代码 |
| **测试覆盖** | 16 个测试用例保证质量 |

### 12.2 未来增强

- 🔄 **动态路由** - 支持运行时添加路由
- 🔒 **权限系统** - 完善的 RBAC 权限控制
- 📊 **路由分析** - 路由访问统计和分析
- 🌍 **国际化** - 路由级别的多语言支持
- 🎨 **过渡动画** - 页面切换动画配置

---

**系列文章目录**  
[← 上一篇：09. 未来路线图](./09-future-roadmap.md)  
[回到目录](./README.md)

---

**相关资源**
- [UPGRADE_ROUTING.md](../UPGRADE_ROUTING.md) - 路由系统升级指南
- [Vue Router 官方文档](https://router.vuejs.org/)
- [示例项目](../examples/spa-app/)
