/**
 * 静态站点构建器
 * 将 DSL 完全编译成独立的静态文件（HTML + JS + CSS）
 * 前端运行时不再依赖 DSL
 */

import { Parser } from '@spark-view/dsl-parser';
import { Compiler } from './compiler';
import { SSRRenderer } from '@spark-view/ssr-server';
import * as fs from 'fs';
import * as path from 'path';

export interface BuildOptions {
  dslPath: string;          // DSL 文件路径
  outputDir: string;        // 输出目录
  baseUrl?: string;         // 基础 URL
  publicPath?: string;      // 资源路径
  minify?: boolean;         // 是否压缩
}

export interface BuildResult {
  success: boolean;
  pages: string[];          // 生成的页面列表
  assets: string[];         // 生成的资源列表
  duration: number;         // 构建耗时（ms）
}

export class StaticBuilder {
  private parser: Parser;
  private compiler: Compiler;
  private renderer: SSRRenderer;

  constructor() {
    this.parser = new Parser();
    this.compiler = new Compiler();
    this.renderer = new SSRRenderer();
  }

  /**
   * 构建静态站点
   */
  async build(options: BuildOptions): Promise<BuildResult> {
    const startTime = Date.now();
    const pages: string[] = [];
    const assets: string[] = [];

    try {
      // 1. 读取 DSL
      const dslContent = fs.readFileSync(options.dslPath, 'utf-8');
      const dsl = JSON.parse(dslContent);
      const ast = this.parser.parse(dslContent);

      // 2. 编译路由配置
      const compileResult = this.compiler.compile(ast);
      
      // 3. 创建输出目录
      this.ensureDir(options.outputDir);

      // 4. 为每个路由生成 HTML 文件
      for (const route of dsl.routes || []) {
        const htmlPath = this.getHtmlPath(route.path, options.outputDir);
        const html = await this.generatePageHtml(dsl, route, compileResult, options);
        
        this.ensureDir(path.dirname(htmlPath));
        fs.writeFileSync(htmlPath, html, 'utf-8');
        
        pages.push(htmlPath);
      }

      // 5. 生成应用入口 JS（包含所有组件）
      const appJsPath = path.join(options.outputDir, 'app.js');
      const appJs = this.generateAppJs(dsl, compileResult, options);
      fs.writeFileSync(appJsPath, appJs, 'utf-8');
      assets.push(appJsPath);

      // 6. 生成路由配置 JS
      const routerJsPath = path.join(options.outputDir, 'router.js');
      const routerJs = this.generateRouterJs(compileResult, options);
      fs.writeFileSync(routerJsPath, routerJs, 'utf-8');
      assets.push(routerJsPath);

      // 7. 生成样式文件
      const cssPath = path.join(options.outputDir, 'app.css');
      const css = this.generateCss(dsl, options);
      fs.writeFileSync(cssPath, css, 'utf-8');
      assets.push(cssPath);

      return {
        success: true,
        pages,
        assets,
        duration: Date.now() - startTime
      };

    } catch (error) {
      console.error('Build failed:', error);
      return {
        success: false,
        pages: [],
        assets: [],
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 生成单个页面的完整 HTML
   */
  private async generatePageHtml(
    dsl: any,
    route: any,
    compileResult: any,
    options: BuildOptions
  ): Promise<string> {
    // SSR 渲染当前页面
    const renderResult = await this.renderer.render(JSON.stringify(dsl), {
      routePath: route.path
    });

    const publicPath = options.publicPath || '/';
    const baseUrl = options.baseUrl || '';

    // 生成完整的 HTML 文档
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${route.meta?.title || dsl.name || 'SPARK VIEW'}</title>
  <base href="${baseUrl}/">
  <link rel="stylesheet" href="${publicPath}app.css">
</head>
<body>
  <div id="app">${renderResult.html}</div>
  
  <!-- 预加载的初始数据 -->
  <script>
    window.__INITIAL_STATE__ = ${JSON.stringify({
      currentPath: route.path,
      pageId: route.pageId,
      dslVersion: dsl.dslVersion,
      buildTime: Date.now()
    })};
  </script>
  
  <!-- Vue 运行时 -->
  <script src="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js"></script>
  
  <!-- 应用代码（已包含所有组件） -->
  <script src="${publicPath}router.js"></script>
  <script src="${publicPath}app.js"></script>
</body>
</html>`;
  }

  /**
   * 生成应用 JS（包含所有组件定义）
   */
  private generateAppJs(dsl: any, compileResult: any, options: BuildOptions): string {
    const components: Record<string, string> = {};

    // 为每个页面生成组件定义
    for (const page of dsl.pages || []) {
      const componentCode = this.generateComponentCode(page, dsl.data);
      components[page.id] = componentCode;
    }

    return `
// SPARK VIEW - 静态构建版本
// 构建时间: ${new Date().toISOString()}
// DSL 版本: ${dsl.dslVersion}

const { createApp, h } = Vue;

// 组件注册表（所有组件已编译）
const components = {
${Object.entries(components).map(([id, code]) => `  '${id}': ${code}`).join(',\n')}
};

// 根组件
const RootComponent = {
  template: '<router-view></router-view>'
};

// 创建 Vue 应用
const app = createApp(RootComponent);

// 注册所有组件
Object.entries(components).forEach(([name, component]) => {
  app.component(name, component);
});

// 使用路由
app.use(router);

// Hydration（接管 SSR 内容）
app.mount('#app');

console.log('✅ SPARK VIEW 应用已启动');
console.log('📦 预编译组件数:', Object.keys(components).length);
console.log('🚀 初始路由:', window.__INITIAL_STATE__.currentPath);
`;
  }

  /**
   * 生成单个组件的代码
   */
  private generateComponentCode(page: any, globalData: any): string {
    // 简化的组件定义（实际需要从 DSL 的 components 结构生成）
    return `{
  name: '${page.id}',
  template: \`<div class="page-${page.id}">
    <h1>${page.title}</h1>
    <!-- 组件内容从 DSL 编译而来 -->
  </div>\`,
  data() {
    return ${JSON.stringify(page.data || {})};
  }
}`;
  }

  /**
   * 生成路由配置 JS
   */
  private generateRouterJs(compileResult: any, options: BuildOptions): string {
    const routerConfig = compileResult.routerConfig || '[]';
    
    return `
// Vue Router 配置（从 DSL 编译）
const { createRouter, createWebHistory } = VueRouter;

const routes = ${routerConfig};

// 创建路由实例
const router = createRouter({
  history: createWebHistory(),
  routes: routes.map(route => ({
    ...route,
    component: components[route.name] || components.home
  }))
});

// 路由守卫
router.beforeEach((to, from, next) => {
  document.title = to.meta?.title || 'SPARK VIEW';
  next();
});
`;
  }

  /**
   * 生成样式文件
   */
  private generateCss(dsl: any, options: BuildOptions): string {
    // 基础样式 + DSL 定义的样式
    return `
/* SPARK VIEW - 静态构建样式 */
/* 构建时间: ${new Date().toISOString()} */

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.6;
  color: #333;
}

#app {
  min-height: 100vh;
}

/* 页面容器 */
${(dsl.pages || []).map((page: any) => `
.page-${page.id} {
  padding: 2rem;
}
`).join('\n')}

/* DSL 定义的自定义样式 */
${dsl.styles || ''}
`;
  }

  /**
   * 获取页面的 HTML 文件路径
   */
  private getHtmlPath(routePath: string, outputDir: string): string {
    if (routePath === '/') {
      return path.join(outputDir, 'index.html');
    }
    
    // /about → about.html
    // /user/profile → user/profile.html
    const cleanPath = routePath.replace(/^\//, '').replace(/\/$/, '');
    return path.join(outputDir, `${cleanPath}.html`);
  }

  /**
   * 确保目录存在
   */
  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
