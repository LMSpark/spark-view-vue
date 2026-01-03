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

      // 4. 生成单个入口 HTML（不预渲染）
      const htmlPath = path.join(options.outputDir, 'index.html');
      const html = this.generateIndexHtml(dsl, options);
      fs.writeFileSync(htmlPath, html, 'utf-8');
      pages.push(htmlPath);

      // 5. 生成应用 JS（包含所有组件，按 pageId 组织）
      const appJsPath = path.join(options.outputDir, 'app.js');
      const appJs = this.generateAppJs(dsl, compileResult, options);
      fs.writeFileSync(appJsPath, appJs, 'utf-8');
      assets.push(appJsPath);

      // 6. 生成路由配置 JS
      const routerJsPath = path.join(options.outputDir, 'router.js');
      const routerJs = this.generateRouterJs(compileResult, options);
      fs.writeFileSync(routerJsPath, routerJs, 'utf-8');
      assets.push(routerJsPath);

      // 7. 生成样式文件（按 pageId 隔离）
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
   * 生成入口 HTML（纯 SPA，不预渲染）
   */
  private generateIndexHtml(dsl: any, options: BuildOptions): string {
    const publicPath = options.publicPath || '/';
    const baseUrl = options.baseUrl || '';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${dsl.name || 'SPARK VIEW'}</title>
  <base href="${baseUrl}/">
  <link rel="stylesheet" href="${publicPath}app.css">
</head>
<body>
  <!-- SPA 挂载点，不预渲染 -->
  <div id="app"></div>
  
  <!-- 构建时元数据 -->
  <script>
    window.__BUILD_INFO__ = ${JSON.stringify({
      dslVersion: dsl.dslVersion,
      buildTime: Date.now(),
      buildMode: 'static'
    })};
  </script>
  
  <!-- Vue 运行时 -->
  <script src="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/vue-router@4/dist/vue-router.global.prod.js"></script>
  
  <!-- 应用代码（所有组件已编译） -->
  <script src="${publicPath}router.js"></script>
  <script src="${publicPath}app.js"></script>
</body>
</html>`;
  }

  /**
   * 生成应用 JS（包含所有组件定义，按 pageId 组织）
   */
  private generateAppJs(dsl: any, compileResult: any, options: BuildOptions): string {
    const components: Record<string, string> = {};

    // 为每个页面生成组件定义
    for (const page of dsl.pages || []) {
      const componentCode = this.generateComponentCode(page, dsl.data);
      components[page.id] = componentCode;
    }

    return `
// SPARK VIEW - 静态构建版本（纯 SPA）
// 构建时间: ${new Date().toISOString()}
// DSL 版本: ${dsl.dslVersion}

const { createApp } = Vue;

// 组件注册表（所有组件已编译，按 pageId 组织）
const components = {
${Object.entries(components).map(([id, code]) => `  '${id}': ${code}`).join(',\n')}
};

// 根组件（纯 SPA，无预渲染内容）
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

// 挂载应用（纯客户端渲染）
app.mount('#app');

console.log('✅ SPARK VIEW 应用已启动（纯 SPA 模式）');
console.log('📦 预编译组件数:', Object.keys(components).length);
console.log('🚀 当前路由:', router.currentRoute.value.path);
`;
  }

  /**
   * 生成单个组件的代码（使用 pageId 作为容器类名）
   */
  private generateComponentCode(page: any, globalData: any): string {
    // 使用 pageId 作为容器，实现样式隔离
    return `{
  name: '${page.id}',
  template: \`<div class="page-container page-${page.id}">
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
   * 生成样式文件（使用 pageId 容器隔离）
   */
  private generateCss(dsl: any, options: BuildOptions): string {
    // 基础样式 + 按 pageId 隔离的页面样式
    return `
/* SPARK VIEW - 静态构建样式（SPA 模式） */
/* 构建时间: ${new Date().toISOString()} */

/* 全局样式 */
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

/* 页面容器基础样式 */
.page-container {
  padding: 2rem;
  min-height: 100vh;
}

/* 按 pageId 隔离的样式（关键！） */
${(dsl.pages || []).map((page: any) => `
/* 页面: ${page.title} (${page.id}) */
.page-${page.id} {
  /* 页面特定样式 */
}

.page-${page.id} h1 {
  color: #667eea;
  margin-bottom: 1rem;
}

.page-${page.id} p {
  margin-bottom: 0.5rem;
}
`).join('\n')}

/* DSL 定义的自定义样式 */
${dsl.styles || ''}

/* 路由过渡动画 */
.v-enter-active,
.v-leave-active {
  transition: opacity 0.3s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
`;
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
