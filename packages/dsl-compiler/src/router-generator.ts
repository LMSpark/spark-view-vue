/**
 * Vue Router 代码生成器
 */

import { RouteConfig, NavigationConfig, RouterConfig } from '@spark-view/dsl-parser';

export interface RouterCodeOutput {
  routerConfig: string;
  navigationComponent?: string;
}

export class RouterGenerator {
  /**
   * 生成 Vue Router 配置代码
   */
  generateRouterConfig(
    routes: RouteConfig[],
    routerConfig?: RouterConfig
  ): string {
    const mode = routerConfig?.mode || 'history';
    const base = routerConfig?.base || '/';

    const routesCode = routes.map(route => this.generateRouteCode(route)).join(',\n  ');

    return `
import { createRouter, ${this.getRouterModeImport(mode)} } from 'vue-router';

const routes = [
  ${routesCode}
];

const router = createRouter({
  history: ${this.getRouterModeCode(mode, base)},
  routes,
  ${this.generateRouterOptions(routerConfig)}
});

${this.generateRouterGuards(routes)}

export default router;
`;
  }

  /**
   * 生成单个路由配置
   */
  private generateRouteCode(route: RouteConfig, _indent = ''): string {
    const parts: string[] = [];

    parts.push(`path: '${route.path}'`);
    parts.push(`name: '${route.name}'`);

    // 组件引用
    if (route.component || route.pageId) {
      const componentId = route.component || route.pageId;
      parts.push(`component: () => import('./pages/${componentId}.vue')`);
    }

    // 元信息
    if (route.meta) {
      parts.push(`meta: ${JSON.stringify(route.meta, null, 2)}`);
    }

    // 重定向
    if (route.redirect) {
      parts.push(`redirect: '${route.redirect}'`);
    }

    // 子路由
    if (route.children && route.children.length > 0) {
      const childrenCode = route.children
        .map(child => this.generateRouteCode(child, '  '))
        .join(',\n    ');
      parts.push(`children: [\n    ${childrenCode}\n  ]`);
    }

    return `{
    ${parts.join(',\n    ')}
  }`;
  }

  /**
   * 获取路由模式导入语句
   */
  private getRouterModeImport(mode: string): string {
    switch (mode) {
      case 'hash':
        return 'createWebHashHistory';
      case 'memory':
        return 'createMemoryHistory';
      case 'history':
      default:
        return 'createWebHistory';
    }
  }

  /**
   * 获取路由模式代码
   */
  private getRouterModeCode(mode: string, base: string): string {
    const historyFn = this.getRouterModeImport(mode);
    return `${historyFn}('${base}')`;
  }

  /**
   * 生成路由器选项
   */
  private generateRouterOptions(config?: RouterConfig): string {
    if (!config) return '';

    const options: string[] = [];

    if (config.scrollBehavior) {
      options.push(`scrollBehavior: () => ({ behavior: '${config.scrollBehavior}' })`);
    }

    if (config.linkActiveClass) {
      options.push(`linkActiveClass: '${config.linkActiveClass}'`);
    }

    if (config.linkExactActiveClass) {
      options.push(`linkExactActiveClass: '${config.linkExactActiveClass}'`);
    }

    return options.join(',\n  ');
  }

  /**
   * 生成路由守卫
   */
  private generateRouterGuards(routes: RouteConfig[]): string {
    const guards: string[] = [];

    // 全局前置守卫 - 处理 meta.requiresAuth
    const hasAuthRoutes = this.hasRoutesWithMeta(routes, 'requiresAuth');
    if (hasAuthRoutes) {
      guards.push(`
// 全局前置守卫 - 权限检查
router.beforeEach((to, from, next) => {
  if (to.meta.requiresAuth && !isAuthenticated()) {
    next({ name: 'login' });
  } else {
    next();
  }
});

function isAuthenticated(): boolean {
  // TODO: 实现实际的认证逻辑
  return false;
}
`);
    }

    // 全局后置钩子 - 更新页面标题
    guards.push(`
// 全局后置钩子 - 更新页面标题
router.afterEach((to) => {
  if (to.meta.title) {
    document.title = to.meta.title as string;
  }
});
`);

    return guards.join('\n');
  }

  /**
   * 检查路由是否有特定的 meta 属性
   */
  private hasRoutesWithMeta(routes: RouteConfig[], metaKey: string): boolean {
    for (const route of routes) {
      if (route.meta && metaKey in route.meta) {
        return true;
      }
      if (route.children && this.hasRoutesWithMeta(route.children, metaKey)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 生成导航组件代码
   */
  generateNavigationComponent(config: NavigationConfig): string {
    if (config.header) {
      return this.generateNavbar(config.header);
    }
    return '';
  }

  /**
   * 生成导航栏组件
   */
  private generateNavbar(nav: any): string {
    const items = nav.items || [];
    const itemsCode = JSON.stringify(items, null, 2);

    return `
<template>
  <nav class="navbar">
    <div class="navbar-brand">
      <router-link to="/">
        <h1>{{ title }}</h1>
      </router-link>
    </div>
    
    <ul class="navbar-menu">
      <li v-for="item in menuItems" :key="item.path" class="menu-item">
        <router-link 
          :to="item.path" 
          :class="{ active: $route.path === item.path }"
          class="menu-link"
        >
          <span v-if="item.icon" class="icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </router-link>
        
        <!-- 子菜单 -->
        <ul v-if="item.children" class="submenu">
          <li v-for="child in item.children" :key="child.path">
            <router-link :to="child.path">{{ child.label }}</router-link>
          </li>
        </ul>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const title = ref('App');
const menuItems = ref(${itemsCode});
</script>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 64px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.navbar-menu {
  display: flex;
  list-style: none;
  margin: 0;
  padding: 0;
  gap: 20px;
}

.menu-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  text-decoration: none;
  color: #333;
  border-radius: 4px;
  transition: all 0.2s;
}

.menu-link:hover,
.menu-link.active {
  background: #f0f0f0;
  color: #1890ff;
}

.submenu {
  display: none;
  position: absolute;
  list-style: none;
  padding: 8px 0;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

.menu-item:hover .submenu {
  display: block;
}
</style>
`;
  }
}
