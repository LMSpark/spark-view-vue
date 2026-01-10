# Form Create TypeScript Demo with SPA Router

完整的 TypeScript + Vite + Vue Router + Mock 示例项目。

## 新增功能

### SPA 路由
- ✅ Vue Router 4 集成
- ✅ 三个路由页面：工作台、用户管理、系统设置
- ✅ 侧边栏菜单自动路由跳转
- ✅ 路由高亮显示

### 架构升级
```
src/
├── router/           # 路由配置
│   └── index.ts
├── views/            # 路由页面组件
│   ├── HomePage.vue
│   ├── UserManagePage.vue
│   └── SettingsPage.vue
├── App.vue           # 布局容器 + router-view
└── main.ts           # 挂载 router
```

## 运行

```bash
pnpm install
npx vite
```

访问 http://localhost:3000

## 功能演示

1. **SPA 体验** - 点击侧边栏菜单切换页面，无刷新
2. **路由状态** - 当前路由自动高亮
3. **数据分离** - 首页仍然通过 JSON 配置驱动
4. **可扩展** - 每个路由页面都可以独立配置 JSON

## 下一步：SSR

如需 SSR（服务端渲染），可选方案：
1. Vite SSR（手动配置）
2. Nuxt 3（开箱即用）
3. VitePress（文档类）
