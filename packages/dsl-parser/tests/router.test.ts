/**
 * 路由功能测试
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser';

describe('路由解析和验证', () => {
  it('应该解析基本路由配置', () => {
    const dsl = `
dslVersion: "1.0"
pages:
  - id: home
    layout:
      type: div
      children:
        - type: h1
          props:
            text: 首页

routes:
  - path: /
    name: home
    pageId: home
    `;

    const ast = parse(dsl, 'yaml');

    expect(ast.routes).toBeDefined();
    expect(ast.routes).toHaveLength(1);
    expect(ast.routes![0].path).toBe('/');
    expect(ast.routes![0].name).toBe('home');
    expect(ast.routes![0].pageId).toBe('home');
  });

  it('应该解析嵌套路由', () => {
    const dsl = `
dslVersion: "1.0"
pages:
  - id: user
    layout:
      type: div
  - id: profile
    layout:
      type: div
  - id: settings
    layout:
      type: div

routes:
  - path: /user
    name: user
    pageId: user
    children:
      - path: profile
        name: user-profile
        pageId: profile
      - path: settings
        name: user-settings
        pageId: settings
    `;

    const ast = parse(dsl, 'yaml');

    expect(ast.routes).toHaveLength(1);
    expect(ast.routes![0].children).toBeDefined();
    expect(ast.routes![0].children).toHaveLength(2);
    expect(ast.routes![0].children![0].path).toBe('profile');
    expect(ast.routes![0].children![1].path).toBe('settings');
  });

  it('应该解析路由元信息', () => {
    const dsl = `
dslVersion: "1.0"
pages:
  - id: admin
    layout:
      type: div

routes:
  - path: /admin
    name: admin
    pageId: admin
    meta:
      title: 管理面板
      requiresAuth: true
      roles:
        - admin
        - moderator
    `;

    const ast = parse(dsl, 'yaml');

    expect(ast.routes![0].meta).toBeDefined();
    expect(ast.routes![0].meta!.title).toBe('管理面板');
    expect(ast.routes![0].meta!.requiresAuth).toBe(true);
    expect(ast.routes![0].meta!.roles).toEqual(['admin', 'moderator']);
  });

  it('应该验证路由路径格式', () => {
    const dsl = `
dslVersion: "1.0"
pages:
  - id: home
    layout:
      type: div

routes:
  - path: home
    name: home
    pageId: home
    `;

    expect(() => parse(dsl, 'yaml')).toThrow('Route path must start with /');
  });

  it('应该验证路由引用的页面存在', () => {
    const dsl = `
dslVersion: "1.0"
pages:
  - id: home
    layout:
      type: div

routes:
  - path: /
    name: home
    pageId: nonexistent
    `;

    expect(() => parse(dsl, 'yaml')).toThrow(
      'Route "/" references non-existent page "nonexistent"'
    );
  });

  it('应该支持动态路由参数', () => {
    const dsl = `
dslVersion: "1.0"
pages:
  - id: detail
    layout:
      type: div

routes:
  - path: /user/:id
    name: user-detail
    pageId: detail
    `;

    const ast = parse(dsl, 'yaml');

    expect(ast.routes![0].path).toBe('/user/:id');
  });

  it('应该解析路由重定向', () => {
    const dsl = `
dslVersion: "1.0"
pages:
  - id: home
    layout:
      type: div

routes:
  - path: /
    name: home
    pageId: home
  - path: /index
    redirect: /
    `;

    const ast = parse(dsl, 'yaml');

    expect(ast.routes).toHaveLength(2);
    expect(ast.routes![1].redirect).toBe('/');
  });
});

describe('导航配置解析', () => {
  it('应该解析基本导航配置', () => {
    const dsl = `
dslVersion: "1.0"
pages:
  - id: home
    layout:
      type: div

navigation:
  header:
    type: navbar
    items:
      - label: 首页
        path: /
      - label: 关于
        path: /about
    `;

    const ast = parse(dsl, 'yaml');

    expect(ast.navigation).toBeDefined();
    expect(ast.navigation!.header).toBeDefined();
    expect(ast.navigation!.header.type).toBe('navbar');
    expect(ast.navigation!.header.items).toHaveLength(2);
    expect(ast.navigation!.header.items![0].label).toBe('首页');
    expect(ast.navigation!.header.items![0].path).toBe('/');
  });

  it('应该解析嵌套导航菜单', () => {
    const dsl = `
dslVersion: "1.0"
pages:
  - id: home
    layout:
      type: div

navigation:
  header:
    type: navbar
    items:
      - label: 产品
        path: /products
        children:
          - label: 服务A
            path: /products/a
          - label: 服务B
            path: /products/b
    `;

    const ast = parse(dsl, 'yaml');

    expect(ast.navigation!.header.items![0].children).toBeDefined();
    expect(ast.navigation!.header.items![0].children).toHaveLength(2);
  });

  it('应该解析导航项元信息', () => {
    const dsl = `
dslVersion: "1.0"
pages:
  - id: home
    layout:
      type: div

navigation:
  header:
    type: navbar
    items:
      - label: GitHub
        path: https://github.com
        icon: github
        meta:
          external: true
          target: _blank
          badge: New
    `;

    const ast = parse(dsl, 'yaml');

    const navItem = ast.navigation!.header.items![0];
    expect(navItem.icon).toBe('github');
    expect(navItem.meta?.external).toBe(true);
    expect(navItem.meta?.target).toBe('_blank');
    expect(navItem.meta?.badge).toBe('New');
  });
});

describe('路由器配置解析', () => {
  it('应该解析路由器模式配置', () => {
    const dsl = `
dslVersion: "1.0"
pages:
  - id: home
    layout:
      type: div

router:
  mode: history
  base: /app/
    `;

    const ast = parse(dsl, 'yaml');

    expect(ast.router).toBeDefined();
    expect(ast.router!.mode).toBe('history');
    expect(ast.router!.base).toBe('/app/');
  });

  it('应该解析滚动行为配置', () => {
    const dsl = `
dslVersion: "1.0"
pages:
  - id: home
    layout:
      type: div

router:
  mode: history
  scrollBehavior:
    savePosition: true
    smooth: true
    `;

    const ast = parse(dsl, 'yaml');

    expect(ast.router!.scrollBehavior).toBeDefined();
    expect(ast.router!.scrollBehavior!.savePosition).toBe(true);
    expect(ast.router!.scrollBehavior!.smooth).toBe(true);
  });

  it('应该解析链接激活类名配置', () => {
    const dsl = `
dslVersion: "1.0"
pages:
  - id: home
    layout:
      type: div

router:
  mode: history
  linkActiveClass: active
  linkExactActiveClass: exact-active
    `;

    const ast = parse(dsl, 'yaml');

    expect(ast.router!.linkActiveClass).toBe('active');
    expect(ast.router!.linkExactActiveClass).toBe('exact-active');
  });
});

describe('面包屑配置解析', () => {
  it('应该解析面包屑配置', () => {
    const dsl = `
dslVersion: "1.0"
pages:
  - id: home
    layout:
      type: div

navigation:
  breadcrumb:
    enabled: true
    separator: ">"
    home:
      label: 首页
      path: /
    `;

    const ast = parse(dsl, 'yaml');

    expect(ast.navigation!.breadcrumb).toBeDefined();
    expect(ast.navigation!.breadcrumb!.enabled).toBe(true);
    expect(ast.navigation!.breadcrumb!.separator).toBe('>');
    expect(ast.navigation!.breadcrumb!.home.label).toBe('首页');
  });
});
