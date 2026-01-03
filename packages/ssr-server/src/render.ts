/**
 * SSR 渲染器
 */

import { App } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { compile } from '@spark-view/dsl-compiler';
import { parse, DSLDocument, PageIRNode } from '@spark-view/dsl-parser';

export interface RenderContext {
  data?: Record<string, unknown>;
  env?: Record<string, string>;
  routePath?: string; // 添加路由路径参数
}

export interface RenderOutput {
  html: string;
  hydrationHints: unknown[];
  criticalCSS?: string;
  routerConfig?: string; // 添加路由配置代码
  navigationComponent?: string; // 添加导航组件代码
  lazyComponents?: Record<string, string>; // 懒加载组件代码映射
  allPages?: Array<{ id: string; name: string; path: string }>; // 所有页面信息
}

export class SSRRenderer {
  /**
   * 渲染 DSL 为 HTML（支持混合架构）
   */
  async render(dslContent: string, context: RenderContext = {}): Promise<RenderOutput> {
    // 步骤 1: 解析 DSL
    const ast = parse(dslContent);

    // 步骤 2: 编译为 Vue Render Function
    const compileOutput = compile(ast, { extractCSS: true });

    // 步骤 3: 如果有路由配置，根据路径选择对应页面
    const targetPage = this.getTargetPage(ast, context.routePath);

    // 步骤 4: 动态执行生成的代码
    const renderModule = this.evalSSRBundle(compileOutput.ssrBundle);

    // 步骤 5: 创建 Vue App 并渲染
    const renderContext = {
      data: { ...ast.data, ...context.data },
      env: { ...ast.env, ...context.env },
      currentRoute: context.routePath || '/',
      page: targetPage,
    };

    const app = renderModule.createApp(renderContext);
    const html = await renderToString(app);

    // 步骤 6: 收集所有页面信息（用于懒加载）
    const allPages = this.getAllPages(ast);

    // 步骤 7: 生成懒加载组件代码（除了当前页面）
    const currentPageId = targetPage?.id;
    const lazyComponents = this.generateLazyComponents(ast, currentPageId);

    return {
      html,
      hydrationHints: compileOutput.hydrationHints,
      criticalCSS: compileOutput.criticalCSS,
      routerConfig: compileOutput.routerConfig,
      navigationComponent: compileOutput.navigationComponent,
      lazyComponents,
      allPages,
    };
  }

  /**
   * 根据路由路径获取目标页面
   */
  private getTargetPage(ast: DSLDocument, routePath?: string): PageIRNode | null {
    // 单页面模式
    if (ast.page) {
      return ast.page;
    }

    // 多页面模式
    if (!ast.pages || ast.pages.length === 0) {
      return null;
    }

    // 如果没有提供路由路径，返回第一个页面
    if (!routePath || !ast.routes) {
      return ast.pages[0];
    }

    // 根据路由路径匹配页面
    const matchRoute = this.matchRoute(ast.routes, routePath);
    if (matchRoute) {
      const pageId = matchRoute.pageId || matchRoute.component;
      const page = ast.pages.find((p) => p.id === pageId);
      return page || ast.pages[0];
    }

    return ast.pages[0];
  }

  /**
   * 简单的路由匹配逻辑
   */
  private matchRoute(routes: Array<{ path: string; pageId?: string; component?: string; [key: string]: unknown }>, path: string): { path: string; pageId?: string; component?: string } | null {
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

  /**
   * 动态执行 SSR Bundle
   * 警告：使用 eval 有安全风险，生产环境应使用 vm2 或 isolated-vm
   */
  private evalSSRBundle(code: string): { createApp: (context: unknown) => App } {
    // 创建模块导出对象
    const moduleExports: Record<string, unknown> = {};

    // 模拟 ES Module 环境
    const moduleCode = `
      ${code}
      return { render, createApp };
    `;

    try {
      // 注意：这里为了简化使用了 Function 构造函数
      // 生产环境应使用更安全的沙箱方案
      const func = new Function('require', 'module', 'exports', moduleCode);
      const result = func(require, { exports: moduleExports }, moduleExports);
      return result as { createApp: (context: unknown) => App };
    } catch (err) {
      console.error('Failed to eval SSR bundle:', err);
      throw err;
    }
  }

  /**
   * 获取所有页面信息
   */
  private getAllPages(ast: DSLDocument): Array<{ id: string; name: string; path: string }> {
    const pages: Array<{ id: string; name: string; path: string }> = [];

    if (ast.pages && ast.routes) {
      ast.pages.forEach((page) => {
        // 查找对应的路由
        const route = this.findRouteByPageId(ast.routes!, page.id);
        pages.push({
          id: page.id,
          name: route?.name || page.id,
          path: route?.path || `/${page.id}`,
        });
      });
    } else if (ast.page) {
      // 单页面模式
      pages.push({
        id: ast.page.id || 'main',
        name: 'Main',
        path: '/',
      });
    }

    return pages;
  }

  /**
   * 根据页面ID查找路由
   */
  private findRouteByPageId(routes: Array<{ pageId?: string; component?: string; children?: unknown[]; [key: string]: unknown }>, pageId: string): { pageId?: string; component?: string; [key: string]: unknown } | null {
    for (const route of routes) {
      if (route.pageId === pageId || route.component === pageId) {
        return route;
      }
      if (route.children) {
        const found = this.findRouteByPageId(route.children, pageId);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * 生成懒加载组件代码（仅包含其他页面）
   */
  private generateLazyComponents(
    ast: DSLDocument,
    currentPageId?: string
  ): Record<string, string> {
    const lazyComponents: Record<string, string> = {};

    if (ast.pages) {
      ast.pages.forEach((page) => {
        if (page.id !== currentPageId) {
          // 简单的组件代码字符串（实际应编译完整的页面）
          lazyComponents[page.id] = `
export default {
  name: '${page.id}',
  data() {
    return {};
  },
  template: \`<div>Lazy loaded: ${page.id}</div>\`
}`;
        }
      });
    }

    return lazyComponents;
  }
}
