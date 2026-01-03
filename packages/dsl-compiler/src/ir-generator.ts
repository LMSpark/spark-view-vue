/**
 * 中间表示 (IR) 生成器
 * 将 AST 转换为简化的 IR，便于后续优化和代码生成
 */

import {
  ComponentNode,
  DSLDocument,
  ExpressionNode,
  RouteConfig,
  NavigationConfig,
} from '@spark-view/dsl-parser';

export interface IRNode {
  type: 'element' | 'text' | 'expression' | 'condition' | 'loop' | 'router' | 'navigation';
  tag?: string;
  props?: Record<string, IRValue>;
  children?: IRNode[];
  expression?: string;
  condition?: string;
  loopItems?: string;
  loopItemVar?: string;
  loopIndexVar?: string;
  hydration?: HydrationConfig;
  id?: string;
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

export type IRValue = string | number | boolean | IRExpression;

export interface IRExpression {
  type: 'expression';
  raw: string;
  ast?: ExpressionNode;
}

export interface HydrationConfig {
  strategy: string;
  priority?: string;
  trigger?: string;
  viewport?: Record<string, unknown>;
}

export class IRGenerator {
  private data: Record<string, unknown> = {};
  private env: Record<string, string> = {};

  generate(dsl: DSLDocument): IRNode {
    this.data = dsl.data || {};
    this.env = dsl.env || {};

    // 处理单页面模式（向后兼容）
    if (dsl.page) {
      return this.transformComponent(dsl.page.layout);
    }

    // 处理多页面模式 - 返回第一个页面的布局
    if (dsl.pages && dsl.pages.length > 0) {
      return this.transformComponent(dsl.pages[0].layout);
    }

    // 如果都没有，返回空容器
    return {
      type: 'element',
      tag: 'div',
      props: {},
      children: [],
    };
  }

  private transformComponent(node: ComponentNode): IRNode {
    // 处理循环
    if (node.loop) {
      return {
        type: 'loop',
        loopItems: node.loop.items,
        loopItemVar: node.loop.itemVar,
        loopIndexVar: node.loop.indexVar,
        children: [this.transformComponentWithoutLoop(node)],
      };
    }

    // 处理条件
    if (node.condition) {
      return {
        type: 'condition',
        condition: node.condition,
        children: [this.transformComponentWithoutLoop(node)],
      };
    }

    return this.transformComponentWithoutLoop(node);
  }

  private transformComponentWithoutLoop(node: ComponentNode): IRNode {
    const irNode: IRNode = {
      type: 'element',
      tag: this.mapComponentType(node.type),
      id: node.id,
    };

    // 转换属性
    if (node.props) {
      irNode.props = {};
      for (const [key, value] of Object.entries(node.props)) {
        irNode.props[key] = this.transformValue(value);
      }
    }

    // 转换子节点
    if (node.children) {
      irNode.children = [];
      for (const child of node.children) {
        if (typeof child === 'string') {
          // 检查是否包含表达式
          if (this.hasExpression(child)) {
            irNode.children.push({
              type: 'expression',
              expression: child,
            });
          } else {
            irNode.children.push({
              type: 'text',
              expression: child,
            });
          }
        } else {
          irNode.children.push(this.transformComponent(child));
        }
      }
    }

    // 水合配置
    if (node.hydration) {
      irNode.hydration = {
        strategy: node.hydration.strategy,
        priority: node.hydration.priority,
        trigger: node.hydration.trigger,
        viewport: node.hydration.viewport,
      };
    }

    return irNode;
  }

  /**
   * 转换路由配置为IR节点
   */
  private transformRoute(route: RouteConfig): RouteIRNode {
    return {
      path: route.path,
      name: route.name,
      component: route.component || route.pageId || '',
      meta: route.meta as Record<string, unknown>,
      children: route.children?.map((child) => this.transformRoute(child)),
      redirect: route.redirect,
    };
  }

  /**
   * 生成路由IR节点
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
   * 生成导航IR节点
   */
  generateNavigationIR(dsl: DSLDocument): IRNode | null {
    if (!dsl.navigation?.header) {
      return null;
    }

    const navConfig = dsl.navigation.header;
    if (navConfig.type !== 'nav' && navConfig.type !== 'navbar') {
      return null;
    }

    const transformNavItem = (item: any): NavigationIRNode => {
      return {
        label: item.label,
        path: item.path,
        icon: item.icon,
        external: item.meta?.external,
        badge: item.meta?.badge,
        children: item.children?.map(transformNavItem),
      };
    };

    return {
      type: 'navigation',
      navigationItems: navConfig.items?.map(transformNavItem),
      navigationType: navConfig.type === 'navbar' ? 'navbar' : 'sidebar',
    };
  }

  private transformValue(value: unknown): IRValue {
    if (typeof value === 'string' && this.hasExpression(value)) {
      return {
        type: 'expression',
        raw: value,
      };
    }
    // 类型守卫：确保返回的是有效的 IRValue 类型
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    // 默认返回空字符串作为后备
    return '';
  }

  private hasExpression(str: string): boolean {
    return /\{\{.*?\}\}/.test(str);
  }

  private mapComponentType(type: string): string {
    // 映射 DSL 组件类型到 HTML 标签或 Vue 组件
    const mapping: Record<string, string> = {
      container: 'div',
      header: 'header',
      footer: 'footer',
      section: 'section',
      text: 'span',
      button: 'button',
      image: 'img',
      link: 'a',
      list: 'ul',
      grid: 'div',
      flex: 'div',
      form: 'form',
      input: 'input',
      select: 'select',
    };

    return mapping[type] || 'div';
  }
}
