import { createApp } from 'vue';
import { createRouter, createWebHistory, Router } from 'vue-router';
import type { App, Component } from 'vue';

/**
 * 混合架构客户端入口
 * 1. 从服务端获取SSR HTML
 * 2. Hydrate（接管）SSR内容
 * 3. 激活客户端路由（SPA模式）
 * 4. 按需加载其他页面组件
 */

export interface HybridBootstrapOptions {
  apiBaseUrl: string;
  dslId: string;
  initialPath: string;
}

export class HybridClient {
  private apiBaseUrl: string;
  private dslId: string;
  private router: Router | null = null;
  private app: App | null = null;
  private lazyComponentsCache: Map<string, Component> = new Map();

  constructor(options: HybridBootstrapOptions) {
    this.apiBaseUrl = options.apiBaseUrl;
    this.dslId = options.dslId;
  }

  /**
   * 初始化混合应用
   */
  async bootstrap() {
    try {
      // 1. 从API获取SSR内容和路由配置
      const renderData = await this.fetchRenderData(window.location.pathname);

      // 2. 创建路由器
      this.router = this.createRouterFromConfig(renderData.routerConfig);

      // 3. 创建Vue应用
      this.app = createApp({
        name: 'HybridApp',
        template: '<router-view />'
      });

      this.app.use(this.router);

      // 4. Hydrate SSR内容
      this.app.mount('#app');

      // 5. 预加载关键路由的组件
      this.preloadCriticalComponents(renderData.lazyComponents);

      console.log('🚀 Hybrid app bootstrapped successfully!');
    } catch (error) {
      console.error('Failed to bootstrap hybrid app:', error);
      throw error;
    }
  }

  /**
   * 获取SSR渲染数据
   */
  private async fetchRenderData(path: string) {
    const url = `${this.apiBaseUrl}/api/render?dslId=${this.dslId}&path=${path}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch render data: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * 从配置代码创建路由器
   */
  private createRouterFromConfig(routerConfigCode: string) {
    // 动态执行路由配置代码
    // 注意：生产环境需要更安全的方式
    const configFunc = new Function('createWebHistory', routerConfigCode + '; return routes;');
    const routes = configFunc(createWebHistory);

    // 为每个路由配置懒加载组件
    const enhancedRoutes = routes.map((route: { pageId?: string; component?: string; [key: string]: unknown }) => ({
      ...route,
      component: () => this.loadComponent(route.pageId || route.component || 'default')
    }));

    return createRouter({
      history: createWebHistory(),
      routes: enhancedRoutes
    });
  }

  /**
   * 懒加载组件
   */
  private async loadComponent(componentName: string) {
    // 1. 检查缓存
    if (this.lazyComponentsCache.has(componentName)) {
      return this.lazyComponentsCache.get(componentName);
    }

    // 2. 从API获取组件代码
    const url = `${this.apiBaseUrl}/api/component/${this.dslId}/${componentName}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`Failed to load component: ${componentName}`);
      return this.createFallbackComponent(componentName);
    }

    const componentCode = await response.text();

    // 3. 动态创建组件
    const component = this.createComponentFromCode(componentCode);

    // 4. 缓存组件
    this.lazyComponentsCache.set(componentName, component);

    return component;
  }

  /**
   * 从代码字符串创建Vue组件
   */
  private createComponentFromCode(code: string) {
    try {
      const func = new Function('return ' + code);
      return func();
    } catch (error) {
      console.error('Failed to create component from code:', error);
      return this.createFallbackComponent('unknown');
    }
  }

  /**
   * 创建降级组件
   */
  private createFallbackComponent(name: string) {
    return {
      name: `Fallback_${name}`,
      template: `<div class="component-loading">Loading ${name}...</div>`
    };
  }

  /**
   * 预加载关键组件
   */
  private async preloadCriticalComponents(lazyComponents: Record<string, string>) {
    // 预加载前3个组件
    const criticalComponents = Object.keys(lazyComponents).slice(0, 3);
    
    const promises = criticalComponents.map(async (name) => {
      try {
        await this.loadComponent(name);
        console.log(`✅ Preloaded: ${name}`);
      } catch (error) {
        console.warn(`⚠️ Failed to preload: ${name}`, error);
      }
    });

    await Promise.allSettled(promises);
  }
}

/**
 * 全局启动函数
 */
export async function initHybridApp(options: HybridBootstrapOptions) {
  const client = new HybridClient(options);
  await client.bootstrap();
  return client;
}

// 自动启动（如果在浏览器环境）
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    // 从meta标签或全局变量读取配置
    const config = (window as { __HYBRID_CONFIG__?: HybridBootstrapOptions }).__HYBRID_CONFIG__ || {
      apiBaseUrl: 'http://localhost:3000',
      dslId: 'default',
      initialPath: window.location.pathname
    };

    initHybridApp(config).catch(console.error);
  });
}
