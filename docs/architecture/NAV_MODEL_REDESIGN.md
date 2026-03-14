# 导航模型 & 项目模型 — 深度分析与重构方案

> **状态**: ✅ 已实施  
> **日期**: 2026-03-14（实施完成）  
> **范围**: NavNode 类型精简 + 废弃桥接清理 + AI 策划兼容性
>
> **⚠️ 更新**：`NavModuleManager.vue`、`SiteManager.vue` 已删除，功能合并到 `DevSystem` 套件（`DevNodeProps.vue` + `useDevState.ts`）。文中引用保留为历史上下文。

---

## 一、现状问题（7 项）

### 问题 1：路由信息双写

导航节点和页面配置表**独立存储**相同路由信息，无 DB 级关联：

| 字段 | NavNode（导航树） | PageConfigEntity（page_config 表） |
|------|---|----|
| path | ✅ | ✅ |
| pageType | ✅ | ✅ |
| title | ✅ | ✅ |
| icon | ✅ | ✅ |

改其中一处，另一处不自动同步。

### 问题 2：三份导航种子数据

| 文件 | 位置 | 用途 |
|------|------|------|
| `navigation-default.json` | `spark-ai-server/src/main/resources/` | 后端默认种子 |
| `navigation-app-default.json` | 同上 | 新项目种子模板 |
| `demo-nav.ts` | `src/layout/` | 前端本地 fallback |

三者结构近似但内容不同步，toolbar 写法各异。

### 问题 3：componentMap 与导航 pageType 双写

`main.ts` 硬编码 componentMap（13 条路径映射），导航节点同时标记 `pageType: 'vue-component'`。新增 Vue 页面必须**两处都改**。

### 问题 4：6 个废弃桥接文件仍有消费者

| 废弃文件 | 消费者 |
|---------|--------|
| `src/layout/nav-types.ts` | `App.vue`, `AppHeader.vue` |
| `src/layout/useNavigation.ts` | `App.vue` |
| `src/layout/useTabPages.ts` | `App.vue` |
| `src/layout/useColorScheme.ts` | `App.vue` |
| `src/config/types.ts` | 仅文档引用 |
| `src/config/loader.ts` | 仅文档引用 |

全部 `@deprecated` re-export，实际消费集中在 `App.vue`（4 处）+ `AppHeader.vue`（1 处）。

### 问题 5：NavNode.pageId 角色模糊

`pageId` 仅供 `NavModuleManager.vue`（导航编辑器）和 `SiteManager.vue` 使用。`useNavigation` 从不读取它——运行时路由完全靠 `path`。其职责与 `path` 重叠（很多节点 `path === '/' + pageId`）。

### 问题 6：AppFullConfig vs StartOptions 字段重叠

两个类型都描述"启动配置"，部分字段重叠：

- `AppFullConfig`（`packages/spark-app/src/config/types.ts`）— 加载器返回值
- `StartOptions`（`packages/spark-app/src/start.ts`）— 启动入口参数

此问题属于**项目模型层**，本次仅记录，不在 NavNode 重构范围内。

### 问题 7：NavNode 字段膨胀 & 开放 meta

当前 NavNode 有 **19 个字段**，其中：
- `affix`：`useTabPages` 从不读取，完全无用
- `permissions`：`hasPermission()` 恒返回 `true`，死代码
- `badge`：运行时通过 `NavigationContext.getBadge()` API 动态设定更合理
- `pageId`：编辑器专用，运行时不用
- `meta: Record<string, unknown>`：开放口袋，实际只用 `meta.action` 一个键

---

## 二、NavNode 字段审计（实际使用情况）

基于全代码库 grep 结果：

| 字段 | useNavigation | AppHeader | App.vue | NavModuleManager | 结论 |
|------|:---:|:---:|:---:|:---:|------|
| id | ✅ | ✅ | ✅ | ✅ | **保留** |
| type | ✅ | — | — | ✅ | **保留，改必填** |
| title | ✅ | ✅ | — | ✅ | **保留** |
| icon | ✅ | ✅ | — | ✅ | **保留** |
| path | ✅ | — | — | ✅ | **保留** |
| pageType | — | — | — | ✅ | **保留**（编辑器需要） |
| **pageId** | — | — | — | ✅ | **删除**（与 path 重叠） |
| redirect | ✅ | — | — | ✅ | **保留** |
| externalUrl | ✅ | — | — | ✅ | **保留** |
| childPlacement | ✅ | — | — | ✅ | **保留** |
| context | ✅ | — | — | ✅ | **保留** |
| children | ✅ | ✅ | — | ✅ | **保留** |
| order | ✅ | — | — | ✅ | **保留** |
| hidden | ✅ | — | — | ✅ | **保留** |
| disabled | ✅ | — | — | ✅ | **保留** |
| **badge** | ✅ | ✅ | — | — | **删除**（改为运行时 API） |
| **permissions** | ✅(恒true) | — | — | — | **删除**（死代码） |
| **affix** | — | — | — | — | **删除**（完全无读取） |
| **meta** | — | ✅(.action) | ✅(.action) | — | **删除**（用 `action` 替代） |

---

## 三、重构方案：NavNode（17 字段）

### 最终类型定义

```typescript
export interface NavNode {
  /** 唯一标识 */
  id: string

  /** 节点类型 — 必填（消除配置歧义） */
  type: NavNodeType   // 'item' | 'group' | 'divider'

  /** 显示标题 */
  title: string

  /** 节点用途描述（AI 理解语义 + 悬停 tooltip） */
  description?: string              // ← 新增

  /** 图标 */
  icon?: string

  /** 路由路径（item 节点） */
  path?: string

  /** 外部链接（新窗口打开） */
  externalUrl?: string

  /** 页面类型（item 节点）：'config' | 'vue-component' */
  pageType?: NavPageType

  /** 子节点（group 节点） */
  children?: NavNode[]

  /** 子项存放位置（group 节点） */
  childPlacement?: ChildPlacement

  /** 默认重定向路径（group 节点） */
  redirect?: string

  /** 上下文选择器 */
  context?: NavContextInput

  /** 排序权重（升序，默认 0） */
  order?: number

  /** 隐藏（不显示在菜单，仍参与路由） */
  hidden?: boolean

  /** 禁用（灰色不可交互） */
  disabled?: boolean

  /** 工具栏动作标识符（toolbar 节点） */
  action?: string                   // ← 新增（替代 meta.action）
}
```

### 变更摘要

| 动作 | 字段 | 理由 |
|------|------|------|
| **删除** | `pageId` | 与 `path` 重叠，运行时从不读取 |
| **删除** | `badge` | 改为 `NavigationContext.setBadge(nodeId, value)` 运行时 API |
| **删除** | `permissions` | `hasPermission()` 恒 true，死代码 |
| **删除** | `affix` | `useTabPages` 完全不读取 |
| **删除** | `meta` | 开放口袋，仅用 1 个键；用 `action` 替代 |
| **新增** | `action` | 替代 `meta.action`，工具栏动作标识 |
| **新增** | `description` | AI 语义锚点 + UI tooltip |
| **修改** | `type` | optional → **必填**，消除配置歧义 |

### 字段–角色适用矩阵

| 字段 | `item` | `group` | `divider` | `toolbar` |
|------|:---:|:---:|:---:|:---:|
| id | ✅ | ✅ | ✅ | ✅ |
| type | ✅ | ✅ | ✅ | ✅ |
| title | ✅ | ✅ | — | ✅ |
| description | ✅ | ✅ | — | ✅ |
| icon | ✅ | ✅ | — | ✅ |
| path | ✅ | — | — | — |
| externalUrl | ✅ | — | — | — |
| pageType | ✅ | — | — | — |
| children | — | ✅ | — | — |
| childPlacement | — | ✅ | — | — |
| redirect | — | ✅ | — | — |
| context | — | ✅ | — | — |
| order | ✅ | ✅ | ✅ | ✅ |
| hidden | ✅ | ✅ | — | ✅ |
| disabled | ✅ | ✅ | — | ✅ |
| action | — | — | — | ✅ |

### NavRoot（不变）

```typescript
export interface NavRoot {
  childPlacement: 'header' | 'sidebar'
  children: NavNode[]
  toolbar?: NavNode[]
}
```

### NavContextConfig 简化

删除 `NavContextRemoteSource` 类型。`source` 字段：
- `string` → URL（GET 请求，自动 JSON）
- `NavContextItem[]` → 静态列表
- `NavContextConfig` 对象自身足够灵活（url + method + params 已覆盖）

删除 `cacheable` 字段（当前从未被消费）。

---

## 四、AI 策划兼容性分析

### 现状：AI 与导航完全隔离

```
AI 生成页面 → POST __batch → page_config 注册 ✅
                                 ↓
                         导航树？ ❌ 断裂（需用户手动 POST /navigation/nodes）
```

- 系统提示词（`system-prompt.txt`）**零导航内容**
- AI 返回值只有 4 个文件（rule.json / pagedata.json / script.js / style.css）
- AI 不知道当前导航树长什么样

### `description` 字段为 AI 策划的作用

| AI 场景 | 没有 description | 有 description |
|---------|-----------------|----------------|
| 生成页面后建议放哪个分组 | 只看 `title` 猜语义，易错 | 读 description 精确匹配 |
| AI 策划/重组导航结构 | 标题层级推断，语义丢失 | 理解每个分组的业务意图 |
| 迭代对话："把库存移到供应链下面" | 不确定"供应链"包含什么 | description 说明范围 |
| 人类理解他人配置 | 只有短标题 | 悬停 tooltip 看说明 |

### 不放入 NavNode 的字段

| 候选字段 | 理由 | 替代方案 |
|----------|------|----------|
| `source: 'manual' \| 'ai'` | 溯源元数据 | 后端 `page_config` 表或 chat 历史 |
| `tags: string[]` | 分类 | `description` + 树层级已够用 |
| `status: 'draft' \| 'active'` | 生命周期 | `hidden` 覆盖"不展示"；草稿态是后端概念 |
| `prompt: string` | 生成提示词 | chat 会话历史，不属于导航 |

### 后续 AI–导航闭环（不影响 NavNode 字段）

NavNode 只需 `description`。AI策划能力需补齐以下工程环节：

1. **系统提示词扩展**：让 AI 知道导航树结构，能建议节点放置
2. **AI 返回值扩展**：增加 `suggestedNavNode` 字段，前端预览后自动插入
3. **上下文注入**：聊天时把当前导航树摘要发给 AI
4. **`__batch` 工作流支持**：可选参数让 `__batch` 同时调 `NavigationService.addNode()`

这些是后端 + 前端工作流改造，按需迭代，**不影响本次类型重构**。

---

## 五、实施计划（10 步）

### Phase A：类型层（零运行时影响）

| # | 任务 | 文件 | 影响 |
|---|------|------|------|
| 1 | 更新 NavNode 类型 | `packages/spark-app/src/navigation/nav-types.ts` | 删除 5 字段 / 新增 2 字段 / type 改必填 |
| 2 | 删除 `NavContextRemoteSource` | 同上 | 简化 NavContextConfig |

### Phase B：运行时消费者

| # | 任务 | 文件 | 影响 |
|---|------|------|------|
| 3 | useNavigation 适配 | `packages/spark-app/src/navigation/useNavigation.ts` | 删除 `getBadge` 从 node 读取、删除 `permissions` 过滤 |
| 4 | AppHeader 适配 | `src/layout/AppHeader.vue` | `item.meta?.['action']` → `item.action` |
| 5 | App.vue 适配 | `src/App.vue` | 同上 + import 从废弃桥接迁移到 `@spark-view/spark-app` |

### Phase C：废弃代码清理

| # | 任务 | 文件 | 影响 |
|---|------|------|------|
| 6 | 删除 6 个废弃桥接文件 | `src/layout/nav-types.ts` 等 | 消费者已在 Step 5 迁移 |
| 7 | 更新 demo-nav.ts | `src/layout/demo-nav.ts` | 所有节点加 `type` / `description` / `action`，保留为前端 fallback |

### Phase D：后端种子数据

| # | 任务 | 文件 | 影响 |
|---|------|------|------|
| 8 | 更新 navigation-default.json | `spark-ai-server/src/main/resources/` | 所有节点加 `type` / `meta.action` → `action` / 删 `affix` / 加 `description` |
| 9 | 更新 navigation-app-default.json | 同上 | 同上 |

### Phase E：编辑器 UI

| # | 任务 | 文件 | 影响 |
|---|------|------|------|
| 10 | NavModuleManager 适配 | `src/views/NavModuleManager.vue` | 移除已删字段表单项，增加 description / action 编辑 |

### Phase F：验证

- `pnpm run typecheck` — 类型检查通过
- `pnpm run lint` — ESLint 通过
- `pnpm run test` — 单元测试通过
- 手动验证：导航渲染、toolbar 动作、导航编辑器

---

## 六、migration-default.json 示例（重构后）

```jsonc
{
  "childPlacement": "header",
  "toolbar": [
    {
      "id": "tb-ai-design",
      "type": "item",           // ← 新增（必填）
      "title": "AI 协同设计",
      "description": "启动 AI 辅助设计会话，支持页面配置自动生成与迭代优化",
      "icon": "🎨",
      "action": "ai-design"     // ← 替代 meta.action
    },
    {
      "id": "tb-search",
      "type": "item",
      "title": "搜索",
      "description": "全局搜索页面、数据和配置",
      "icon": "🔍",
      "action": "search"
    }
  ],
  "children": [
    {
      "id": "home",
      "type": "item",           // ← 新增
      "title": "工作台",
      "description": "个人工作台仪表板，汇总待办与统计",
      "icon": "📊",
      "path": "/dashboard",
      "pageType": "vue-component"
      // affix 已删除
    },
    {
      "id": "system",
      "type": "group",          // ← 新增
      "title": "系统管理",
      "description": "平台级管理功能：用户、权限、导航、缓存、页面配置",
      "icon": "⚙️",
      "childPlacement": "sidebar",
      "redirect": "/users",
      "children": [
        {
          "id": "users",
          "type": "item",
          "title": "用户管理",
          "description": "用户账号 CRUD 与角色分配",
          "icon": "👥",
          "path": "/users"
        }
      ]
    }
  ]
}
```

---

## 七、风险与注意事项

| 风险 | 缓解措施 |
|------|---------|
| NavModuleManager.vue 保存旧格式数据到后端 | Step 10 同步更新编辑器表单 |
| 后端 `NavigationService` Java 反序列化字段不匹配 | Java 用 `@JsonIgnoreProperties(ignoreUnknown = true)`，新增字段自动忽略；删除字段无副作用 |
| 已有数据库中存量导航数据无 `type` 字段 | 后端 Java 反序列化时 `type` 为 null，前端 `useNavigation` 可设默认值 'item' 做过渡 |
| `demo-nav.ts` 删除后 fallback 缺失 | 导航已由后端 seed 提供，前端不需要 fallback |

---

## 八、不在本次范围

以下识别出但**暂不处理**的事项，记录备查：

1. **SSOT 架构**：DynamicRouter 从 nav 树提取路由（替代 page_config generateRoutesJson）——属于后端大改，单独任务
2. **AppFullConfig / StartOptions 合并**——项目模型层，单独任务
3. **AI 策划工作流**（system-prompt 扩展、suggestedNavNode、上下文注入）——需要后端 API 设计，单独任务
4. **运行时 badge API**（`NavigationContext.setBadge(nodeId, value)`）——需要 useNavigation 新增方法，可随附实施但不阻塞类型重构
