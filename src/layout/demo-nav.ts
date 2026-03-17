import type { NavRoot } from '@spark-view/spark-app'

/**
 * 演示导航树 — 将 routes.json 中的扁平路由组织为模块化导航。
 *
 * childPlacement 演示：
 *   - 根 → header（模块在顶部水平显示）
 *   - 数据演示 → sidebar（子项在左侧栏）
 *   - 组件演示 → sidebar（子项在左侧栏）
 *   - 系统管理 → sidebar + parent（子菜单嵌套在侧栏内）
 */
export const demoNavRoot: NavRoot = {
  title: 'SPARK Demo',
  childPlacement: 'header',
  homePath: '/dashboard',
  children: [
    /* ── 工具栏（childPlacement: 'toolbar'，子项在右上角显示） ── */
    {
      id: '__toolbar__',
      type: 'group',
      nodeKind: 'system-directory',
      title: '工具栏',
      icon: 'SetUp',
      childPlacement: 'toolbar',
      children: [
        { id: 'tb-ai-design', type: 'item', nodeKind: 'system-page', title: 'AI 协同设计', icon: 'Brush', action: 'ai-design' },
        { id: 'tb-ai-chat', type: 'item', nodeKind: 'system-page', title: 'AI 对话', icon: 'ChatDotRound', action: 'ai-chat' },
        { id: 'tb-search', type: 'item', nodeKind: 'system-page', title: '搜索', icon: 'Search', action: 'search' },
        { id: 'tb-fullscreen', type: 'item', nodeKind: 'system-page', title: '全屏', icon: 'FullScreen', action: 'fullscreen' },
        { id: 'tb-notifications', type: 'item', nodeKind: 'system-page', title: '通知', icon: 'Bell', action: 'notifications' },
        { id: 'tb-theme', type: 'item', nodeKind: 'system-page', title: '主题切换', icon: 'Moon', action: 'theme-toggle' },
      ],
    },

    /* ── 用户菜单（childPlacement: 'user-menu'，右上角头像下拉） ── */
    {
      id: '__user-menu__',
      type: 'group',
      nodeKind: 'system-directory',
      title: '用户菜单',
      icon: 'User',
      childPlacement: 'user-menu',
      children: [
        { id: 'um-profile', type: 'item', nodeKind: 'system-page', title: '个人中心', icon: 'User', action: 'profile' },
        { id: 'um-settings', type: 'item', nodeKind: 'system-page', title: '系统设置', icon: 'Setting', action: 'settings' },
        { id: 'um-home', type: 'item', nodeKind: 'system-page', title: '平台主页', icon: 'HomeFilled', action: 'home' },
      ],
    },

    /* ── 首页（叶子） ── */
    {
      id: 'home',
      type: 'item',
      nodeKind: 'system-page',
      title: '工作台',
      description: '个人工作台仪表板，汇总待办与统计',
      icon: 'DataBoard',
      path: '/',
      pageType: 'vue-component',
    },

    /* ── 数据演示模块 → sidebar + 模块级上下文选项 ── */
    {
      id: 'data-demos',
      type: 'group',
      nodeKind: 'module',
      title: '数据管理',
      description: '数据绑定、级联、异步加载等数据层演示',
      icon: 'Connection',
      childPlacement: 'sidebar',
      redirect: '/dataset-demo',
      context: [
        { id: 'proj-a', title: '项目 A — 电商平台' },
        { id: 'proj-b', title: '项目 B — 内部 OA' },
        { id: 'proj-c', title: '项目 C — 数据中台' },
      ],
      children: [
        { id: 'dataset-demo', type: 'item', nodeKind: 'page', title: 'DataSet 主从表', icon: 'Connection', path: '/dataset-demo' },
        { id: 'cascade-demo', type: 'item', nodeKind: 'page', title: '级联操作', icon: 'Lightning', path: '/cascade-demo' },
        { id: 'async-demo', type: 'item', nodeKind: 'page', title: '异步数据', icon: 'Refresh', path: '/async-demo' },
        { id: 'smart-load', type: 'item', nodeKind: 'page', title: '智能依赖加载', icon: 'Cpu', path: '/smart-load' },
        { id: 'master-detail', type: 'item', nodeKind: 'page', title: 'Master-Detail', icon: 'Connection', path: '/master-detail' },
        { id: 'test-order', type: 'item', nodeKind: 'page', title: '订单测试', icon: 'Box', path: '/test-order' },
      ],
    },

    /* ── 组件演示模块 → sidebar ── */
    {
      id: 'component-demos',
      type: 'group',
      nodeKind: 'module',
      title: '组件演示',
      description: '渲染器容器、表格、表单、栅格等 UI 组件演示',
      icon: 'Grid',
      childPlacement: 'sidebar',
      redirect: '/renderer-demo',
      children: [
        { id: 'renderer-demo', type: 'item', nodeKind: 'page', title: 'Renderer 架构', icon: 'Brush', path: '/renderer-demo' },
        { id: 'section-grid', type: 'item', nodeKind: 'page', title: 'Section 栅格', icon: 'Grid', path: '/section-grid-demo', pageId: 'section-grid-demo' },
        { id: 'el-table-demo', type: 'item', nodeKind: 'page', title: 'el-table 操作列', icon: 'List', path: '/el-table-demo' },
        { id: 'vxe-demo', type: 'item', nodeKind: 'page', title: 'VXE 表格', icon: 'TrendCharts', path: '/vxe-demo' },
        { id: 'formcreate-api', type: 'item', nodeKind: 'page', title: 'Form-Create API', icon: 'SetUp', path: '/formcreate-api' },
        { id: 'filter-demo', type: 'item', nodeKind: 'page', title: '过滤面板', icon: 'Search', path: '/filter-demo' },
        { id: 'capability-demo', type: 'item', nodeKind: 'system-page', title: '能力管理演示', icon: 'Aim', path: '/capability-demo', pageType: 'vue-component' },
        { id: 'tenant-config', type: 'item', nodeKind: 'system-page', title: '多租户配置', icon: 'OfficeBuilding', path: '/tenant-config', pageType: 'vue-component' },
      ],
    },

    /* ── 树形结构模块 → sidebar ── */
    {
      id: 'tree-demos',
      type: 'group',
      nodeKind: 'module',
      title: '树形结构',
      description: '树组件、TreeTable、Node Scope 等树形结构演示',
      icon: 'Share',
      childPlacement: 'sidebar',
      redirect: '/tree-demo',
      children: [
        { id: 'tree-demo', type: 'item', nodeKind: 'page', title: '树形结构演示', icon: 'Share', path: '/tree-demo' },
        { id: 'treetable-demo', type: 'item', nodeKind: 'page', title: 'TreeTable 演示', icon: 'Share', path: '/treetable-demo' },
        { id: 'tree-node-scope', type: 'item', nodeKind: 'page', title: 'Node Scope', icon: 'Share', path: '/tree-node-scope-demo' },
      ],
    },

    /* ── 系统管理模块 → sidebar（含 parent 子菜单） ── */
    {
      id: 'system',
      type: 'group',
      nodeKind: 'module',
      title: '系统管理',
      description: '平台级管理功能：用户、权限、导航、缓存、页面配置',
      icon: 'Setting',
      childPlacement: 'sidebar',
      redirect: '/users',
      children: [
        { id: 'users', type: 'item', nodeKind: 'page', title: '用户管理', icon: 'UserFilled', path: '/users' },
        { id: 'permission-render', type: 'item', nodeKind: 'page', title: '权限渲染', icon: 'Lock', path: '/permission-render' },
        { id: 'dev-system', type: 'item', nodeKind: 'system-page', title: '开发系统', icon: 'Lightning', path: '/dev', pageType: 'vue-component' },
        { id: 'cache-manager', type: 'item', nodeKind: 'system-page', title: '缓存管理', icon: 'Coin', path: '/cache-manager', pageType: 'vue-component' },
        { id: 'dashboard', type: 'item', nodeKind: 'system-page', title: '管理仪表板', icon: 'HomeFilled', path: '/dashboard', pageType: 'vue-component' },
        { id: 'about', type: 'item', nodeKind: 'system-page', title: '关于系统', icon: 'InfoFilled', path: '/about', pageType: 'vue-component' },
        {
          id: 'system-settings',
          type: 'group',
          nodeKind: 'module',
          title: '系统设置',
          description: '平台基本设置与参数配置',
          icon: 'Setting',
          childPlacement: 'parent',
          children: [
            { id: 'settings', type: 'item', nodeKind: 'system-page', title: '基本设置', icon: 'Setting', path: '/settings', pageType: 'vue-component' },
          ],
        },
      ],
    },

    /* ── AI Studio（独立叶子） ── */
    {
      id: 'ai-studio',
      type: 'item',
      nodeKind: 'system-page',
      title: 'AI Studio',
      description: 'AI 驱动的可视化页面设计工作室',
      icon: 'MagicStick',
      path: '/ai-studio',
      pageType: 'vue-component',
    },

    /* ── AI 迭代测试 ── */
    {
      id: 'ai-test',
      type: 'item',
      nodeKind: 'page',
      title: 'AI 迭代测试',
      description: 'AI 页面生成与迭代优化的测试场',
      icon: 'Opportunity',
      path: '/ai-test',
    },
  ],
}
