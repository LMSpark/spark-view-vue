/**
 * SSR 渲染器
 */

import { App } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { compile } from '@spark-view/dsl-compiler';
import { parse, DSLDocument } from '@spark-view/dsl-parser';

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
}

export class SSRRenderer {
  /**
   * 渲染 DSL 为 HTML
   */
  async render(dslContent: string, context: RenderContext = {}): Promise<RenderOutput> {
    // 步骤 1: 解析 DSL
    const ast = parse(dslContent, 'yaml');

    // 步骤 2: 编译为 Vue Render Function
    const compileOutput = compile(ast, { extractCSS: true });

    // 步骤 3: 如果有路由配置，根据路径选择对应页面
    let targetPage = this.getTargetPage(ast, context.routePath);

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

    return {
      html,
      hydrationHints: compileOutput.hydrationHints,
      criticalCSS: compileOutput.criticalCSS,
      routerConfig: compileOutput.routerConfig,
      navigationComponent: compileOutput.navigationComponent,
    };
  }

  /**
   * 根据路由路径获取目标页面
   */
  private getTargetPage(ast: DSLDocument, routePath?: string): any {
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
}
