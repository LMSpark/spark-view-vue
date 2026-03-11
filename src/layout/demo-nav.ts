import type { NavRoot } from './nav-types'

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
  childPlacement: 'header',
  children: [
    /* ── 首页（叶子，固定标签） ── */
    {
      id: 'home',
      title: '工作台',
      icon: '📊',
      path: '/',
      affix: true,
    },

    /* ── 数据演示模块 → sidebar + 模块级上下文选项 ── */
    {
      id: 'data-demos',
      title: '数据管理',
      icon: '🔗',
      childPlacement: 'sidebar',
      redirect: '/dataset-demo',
      // 模块级上下文选项（NavContextInput 静态列表简写）
      // 进入该模块的任意子页面时，Header/Sidebar 尾部会显示选择器
      context: [
        { id: 'proj-a', title: '项目 A — 电商平台' },
        { id: 'proj-b', title: '项目 B — 内部 OA' },
        { id: 'proj-c', title: '项目 C — 数据中台' },
      ],
      children: [
        { id: 'dataset-demo', title: 'DataSet 主从表', icon: '🔗', path: '/dataset-demo' },
        { id: 'cascade-demo', title: '级联操作', icon: '⚡', path: '/cascade-demo' },
        { id: 'async-demo', title: '异步数据', icon: '🔄', path: '/async-demo' },
        { id: 'smart-load', title: '智能依赖加载', icon: '🧠', path: '/smart-load' },
        { id: 'master-detail', title: 'Master-Detail', icon: '🔗', path: '/master-detail' },
      ],
    },

    /* ── 组件演示模块 → sidebar ── */
    {
      id: 'component-demos',
      title: '组件演示',
      icon: '🧩',
      childPlacement: 'sidebar',
      redirect: '/renderer-demo',
      children: [
        { id: 'renderer-demo', title: 'Renderer 架构', icon: '🎨', path: '/renderer-demo' },
        { id: 'section-grid', title: 'Section 栅格', icon: '🧩', path: '/section-grid-demo' },
        { id: 'el-table-demo', title: 'el-table 操作列', icon: '📋', path: '/el-table-demo' },
        { id: 'vxe-demo', title: 'VXE 表格', icon: '📈', path: '/vxe-demo' },
        { id: 'formcreate-api', title: 'Form-Create API', icon: '🔧', path: '/formcreate-api' },
      ],
    },

    /* ── 树形结构模块 → sidebar（含 parent 嵌套） ── */
    {
      id: 'tree-demos',
      title: '树形结构',
      icon: '🌳',
      childPlacement: 'sidebar',
      redirect: '/tree-demo',
      children: [
        { id: 'tree-demo', title: '树形结构演示', icon: '🌳', path: '/tree-demo' },
        { id: 'treetable-demo', title: 'TreeTable 演示', icon: '🌲', path: '/treetable-demo' },
        { id: 'tree-node-scope', title: 'Node Scope', icon: '🌿', path: '/tree-node-scope-demo' },
      ],
    },

    /* ── 系统管理模块 → sidebar（含 parent 子菜单） ── */
    {
      id: 'system',
      title: '系统管理',
      icon: '⚙️',
      childPlacement: 'sidebar',
      redirect: '/users',
      children: [
        { id: 'users', title: '用户管理', icon: '👥', path: '/users' },
        { id: 'permission-render', title: '权限渲染', icon: '🎨', path: '/permission-render' },
        { id: 'dev-system', title: '开发系统', icon: '⚡', path: '/dev' },
        {
          id: 'system-settings',
          title: '系统设置',
          icon: '⚙️',
          childPlacement: 'parent',
          children: [
            { id: 'settings', title: '基本设置', icon: '⚙️', path: '/settings' },
          ],
        },
      ],
    },

    /* ── AI Studio（独立叶子） ── */
    {
      id: 'ai-studio',
      title: 'AI Studio',
      icon: '🤖',
      path: '/ai-studio',
    },
  ],
}
