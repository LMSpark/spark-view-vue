# SPARK 开发系统工程链重构设计文档

> **文档状态**：设计讨论稿（待确认后实施）  
> **分支**：`feat/ai-server-config-management`  
> **约束**：后端 Java 代码不修改，所有改动限于前端

---

## 1. 背景与目标

### 1.1 现状分析

当前系统存在 **5 个独立的 AI 交互入口**，各自独立工作，缺乏完整的工程链串联：

| 入口 | 位置 | 功能 | 问题 |
|------|------|------|------|
| **AiChatPanel** | App.vue 底部浮窗 | 快速生成/迭代 + 自动纠错循环 | 无导航规划，直接跳到页面配置生成 |
| **AiDesignStudio** | App.vue 右侧抽屉 | 多轮协商设计 + Proposal 提案系统 | 有阶段模型但与导航脱节，不管功能规划 |
| **AiChatWidget** | App.vue header popover | 通用问答 + 文件上传 | 纯对话，无结构化输出 |
| **DevAiPanel** | DevSystem 右栏 | 页面生成/迭代 + 日志查看 | 功能与 AiChatPanel 高度重复 |
| **AiStudioPanel** | SPARK 全局组件 `ai-studio` | 可嵌入式 AI 操作面板 | 功能与 DevAiPanel 几乎相同 |

同时存在 **2 个独立管理页面**：

| 页面 | 位置 | 功能 | 问题 |
|------|------|------|------|
| **SiteManager** | `src/views/SiteManager.vue` (~900 行) | 站点树管理 + 节点属性编辑 | 独立页面，与 AI 系统无关联 |
| **NavModuleManager** | `src/views/NavModuleManager.vue` (~660 行) | 导航模块管理 + 树编辑器 | 独立页面，与 AI 系统无关联 |

### 1.2 核心问题

**缺少完整工程链**——从「用户需求」到「可运行页面」之间断裂：

```
                      ╭─ SiteManager（手动管站点树）
用户有需求 ─→ ？？？ ─┤
                      ╰─ AiChatPanel / AiDesignStudio（直接生成页面配置）
                               ↑ 跳过了功能规划、导航结构设计
```

**理想的工程链**应为：

```
用户需求 ─→ 功能规划 ─→ 导航结构 ─→ 页面设计 ─→ 页面生成 ─→ 预览验证
   ①          ②           ③          ④          ⑤          ⑥
```

### 1.3 重构目标

以 **DevSystem 为改造起点**，构建覆盖 ①-⑥ 的完整工程链，实现：

1. **需求 → 功能拆解**：AI 辅助将用户需求分解为功能模块
2. **功能 → 导航设计**：自动规划导航结构（模块/分组/页面层级）
3. **导航 → 页面设计**：逐页进行 AI 协同设计（复用已有 Proposal 系统）
4. **页面 → 生成部署**：一键生成 + 自动注册路由 + 热更新预览
5. **闭环迭代**：在同一界面内完成 预览 → 反馈 → 修改 循环

---

## 2. 新架构：统一开发工作台

### 2.1 整体架构

将 DevSystem 从「导航+文件编辑器」升级为**统一开发工作台**，整合所有 AI 能力：

```
┌─────────────────────────────────────────────────────────────────────┐
│  SPARK 开发工作台 (DevWorkbench)                                      │
├──────────┬──────────────────────────────────────┬───────────────────┤
│          │                                      │                   │
│ 项目树    │         工作区 (Workspace)              │   AI 助手面板     │
│          │                                      │                   │
│ 📋 需求   │  ┌──────────────────────────────┐    │  💬 对话流         │
│   需求-1  │  │  Tab: 需求分析 | 导航设计      │    │                   │
│   需求-2  │  │       | 页面设计 | 代码编辑     │    │  📋 提案列表       │
│          │  └──────────────────────────────┘    │                   │
│ 🏗️ 模块   │                                      │  🎯 阶段指示器     │
│  └ 订单   │  ← 当前工作内容 →                      │                   │
│    └ 列表 │                                      │  ⚡ 快捷操作       │
│    └ 详情 │                                      │                   │
│  └ 用户   │                                      │                   │
│          │                                      │                   │
├──────────┴──────────────────────────────────────┴───────────────────┤
│  状态栏：阶段进度 | 页面计数 | 保存状态 | AI 状态                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 工程链阶段模型

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ ① 需求    │───→│ ② 功能    │───→│ ③ 导航    │───→│ ④ 页面    │───→│ ⑤ 验证    │
│   理解    │    │   拆解    │    │   设计    │    │   设计    │    │   部署    │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
  AI 追问         AI 规划          AI + 手动        AI 协同         预览 + 迭代
  澄清需求        模块/页面        生成导航树        逐页设计        自动纠错
```

| 阶段 | 输入 | 输出 | AI 角色 | 用户角色 |
|------|------|------|---------|---------|
| ① 需求理解 | 自然语言描述 | 结构化需求摘要 | 追问、澄清、确认 | 描述需求、回答追问 |
| ② 功能拆解 | 需求摘要 | 功能模块列表 + 页面清单 | 分析、规划、建议 | 确认/调整模块划分 |
| ③ 导航设计 | 功能模块列表 | NavRoot JSON（导航树） | 生成导航结构 | 调整层级、拖拽排序 |
| ④ 页面设计 | 单页需求 + 导航上下文 | Proposals（数据/UI/交互） | 逐步提案 | 采纳/拒绝/修改 |
| ⑤ 验证部署 | 已采纳 Proposals | 4 文件 + 路由注册 | 生成 + 自动纠错 | 预览 + 反馈迭代 |

### 2.3 与现有组件的关系

| 现有组件 | 重构后的角色 | 改动程度 |
|---------|------------|---------|
| **DevSystem.vue** | 升级为 DevWorkbench（统一入口） | **重写** |
| **useDevState.ts** | 拆分为多个专职 composable | **重构** |
| **DevSiteTree.vue** | 升级为项目树（需求 + 导航 混合树） | **重写** |
| **DevNodeProps.vue** | 保留，增强为上下文属性面板 | 增强 |
| **DevAiPanel.vue** | 替换为 WorkbenchAiPanel（整合 Proposal 系统） | **重写** |
| **AiDesignStudio.vue** | Proposal 逻辑复用，UI 集成到工作台 | 拆解复用 |
| **useDesignSession.ts** | 核心保留（协议解析 + Proposal 管理） | 微调 |
| **responsePipeline.ts** | 直接复用 | 不变 |
| **useAiChat.ts** | 直接复用（SSE 流式聊天核心） | 不变 |
| **SiteManager.vue** | 导航编辑能力合并到工作台 | 废弃 |
| **NavModuleManager.vue** | 导航编辑能力合并到工作台 | 废弃 |
| **AiChatPanel.vue** | 保留为轻量快捷入口（App.vue 浮窗） | 不变 |
| **AiChatWidget.vue** | 保留为通用问答入口 | 不变 |
| **AiStudioPanel.vue** | 保留为嵌入式组件（外部使用） | 不变 |

---

## 3. 详细设计

### 3.1 新增 composable：`useProjectState`

管理整个项目的工程链状态，替代原来的 `useDevState`：

```typescript
// src/views/dev-system/composables/useProjectState.ts

interface ProjectState {
  // ── 工程链阶段 ──
  currentStage: 'requirements' | 'functions' | 'navigation' | 'page-design' | 'verification'
  
  // ── 需求 ──
  requirements: Requirement[]      // 用户需求列表
  activeRequirementId: string | null
  
  // ── 功能模块 ──
  modules: FunctionModule[]        // AI 规划的功能模块
  
  // ── 导航树 ──
  navRoot: NavRoot                 // 导航模型（与后端同步）
  navDirty: boolean
  
  // ── 页面设计 ──
  activePageId: string | null      // 当前正在设计的页面
  pageDesignStates: Map<string, PageDesignState>  // 每页独立的设计状态
  
  // ── AI 状态 ──
  aiPanelVisible: boolean
  aiContext: AiWorkContext          // AI 当前工作上下文
}
```

**核心类型**：

```typescript
/** 用户需求条目 */
interface Requirement {
  id: string
  title: string                    // 简短标题
  description: string              // 详细描述（用户原始输入）
  status: 'draft' | 'analyzed' | 'planned' | 'completed'
  aiSummary?: string               // AI 理解确认的结构化摘要
  relatedModules: string[]         // 关联的功能模块 ID
  createdAt: Date
}

/** 功能模块（AI 规划的产出） */
interface FunctionModule {
  id: string
  name: string                     // 模块名称（如"订单管理"）
  icon: string
  description: string              // 功能说明
  pages: PagePlan[]                // 模块下的页面规划
  requirementId: string            // 来源需求 ID
  status: 'planned' | 'designing' | 'generated' | 'verified'
}

/** 页面规划（功能拆解阶段的产出） */
interface PagePlan {
  pageId: string                   // 页面 ID（kebab-case）
  title: string                    // 页面标题
  description: string              // 页面功能描述
  pageType: 'list' | 'detail' | 'form' | 'dashboard' | 'tree' | 'custom'
  dataEntities: string[]           // 相关数据实体（表名）
  status: 'planned' | 'designing' | 'generated' | 'verified'
}

/** 单页设计状态（复用 DesignSession 概念） */
interface PageDesignState {
  pageId: string
  proposals: DesignProposal[]      // 复用现有 Proposal 类型
  phase: SessionPhase              // 复用现有阶段类型
  chatHistory: ChatMessage[]       // 该页面的 AI 对话历史
}

/** AI 工作上下文（告诉 AI 面板当前应该做什么） */
interface AiWorkContext {
  stage: ProjectState['currentStage']
  targetId: string | null          // 当前操作的需求/模块/页面 ID
  systemPrompt: string             // 根据阶段动态构建
  contextData: unknown             // 上下文数据（已确认的需求/模块/导航等）
}
```

### 3.2 项目树（左栏）

原来的 DevSiteTree 只展示导航节点。新的项目树展示**完整工程链结构**：

```
📁 项目
├── 📋 需求 (Requirements)
│   ├── 📝 订单管理系统                    ← 需求条目
│   └── 📝 用户权限管理                    ← 需求条目
├── 🏗️ 功能模块 (Modules)                 ← AI 规划产出
│   ├── 📦 订单管理
│   │   ├── 📄 order-list (订单列表)       ← 页面节点
│   │   └── 📄 order-detail (订单详情)
│   └── 📦 用户管理
│       ├── 📄 user-list (用户列表)
│       └── 📄 user-roles (角色分配)
└── 🌐 导航结构 (Navigation)               ← 对应 NavRoot
    ├── 🔖 订单中心
    │   ├── 📄 /order-list
    │   └── 📄 /order-detail
    └── 🔖 系统管理
        ├── 📄 /user-list
        └── 📄 /user-roles
```

**交互规则**：
- 点击「需求」节点 → 工作区显示需求分析面板，AI 面板切到需求理解模式
- 点击「模块」节点 → 工作区显示模块详情，AI 面板切到功能拆解模式
- 点击「页面」节点 → 工作区显示页面设计/代码编辑，AI 面板切到页面设计模式
- 点击「导航」节点 → 工作区显示导航编辑器，AI 面板切到导航设计模式
- 拖拽排序在各个层级内工作

### 3.3 工作区（中栏）—— 阶段化视图

工作区根据当前阶段/选中节点显示不同内容：

#### 3.3.1 需求分析视图

```
┌─────────────────────────────────────────────┐
│  📋 需求分析                                   │
├─────────────────────────────────────────────┤
│                                             │
│  需求标题: [               ]                  │
│                                             │
│  需求描述:                                    │
│  ┌─────────────────────────────────────┐    │
│  │  请描述你的业务需求...                    │    │
│  │  例：需要一个订单管理系统，包含订单       │    │
│  │  查询、订单详情、订单审批流程...          │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [🤖 AI 分析] [💾 保存]                       │
│                                             │
│  ── AI 理解确认 ──────────────────────────    │
│  ✅ 核心实体：订单、订单项、客户              │
│  ✅ 业务场景：CRUD + 审批流 + 统计            │
│  ✅ 用户角色：管理员、销售、财务              │
│  ⚠️ 待确认：是否需要导入导出？                 │
│                                             │
└─────────────────────────────────────────────┘
```

#### 3.3.2 功能规划视图

```
┌─────────────────────────────────────────────┐
│  🏗️ 功能规划  ← 需求: "订单管理系统"           │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │ 📦 订单管理                    [✅ ✏️ 🗑️]│   │
│  │ ├─ 📄 order-list  订单列表    [已规划]│   │
│  │ ├─ 📄 order-detail 订单详情   [已规划]│   │
│  │ └─ 📄 order-approve 订单审批  [已规划]│   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │ 📦 客户管理                    [✅ ✏️ 🗑️]│   │
│  │ ├─ 📄 customer-list  客户列表 [已规划]│   │
│  │ └─ 📄 customer-detail 客户详情[已规划]│   │
│  └──────────────────────────────────────┘   │
│                                             │
│  [➕ 手动添加模块]  [🤖 AI 重新规划]           │
│  [➡️ 生成导航结构]                             │
│                                             │
└─────────────────────────────────────────────┘
```

#### 3.3.3 导航设计视图

复用现有 DevSiteTree + DevNodeProps 的能力，增强为可视化导航编辑器：

```
┌─────────────────────────────────────────────┐
│  🌐 导航设计                                  │
├──────────────────┬──────────────────────────┤
│                  │                          │
│  导航树预览       │  节点属性编辑             │
│                  │                          │
│  🔖 订单中心     │  ID: order-center        │
│   ├ 📄 订单列表  │  标题: 订单中心            │
│   ├ 📄 订单详情  │  图标: 📦                 │
│   └ 📄 订单审批  │  路径: /order-list        │
│  🔖 客户中心     │  Page ID: order-list      │
│   ├ 📄 客户列表  │  放置: sidebar            │
│   └ 📄 客户详情  │                          │
│                  │  上下文选择器:             │
│  [➕ 根模块]     │  [  ] 启用                │
│  [🤖 AI 调整]   │                          │
│  [💾 保存到后端] │  [💾 保存] [↩ 撤销]      │
│                  │                          │
├──────────────────┴──────────────────────────┤
│  [📱 预览] [🔄 同步到后端] [➡️ 开始页面设计]   │
└─────────────────────────────────────────────┘
```

#### 3.3.4 页面设计视图

整合 AiDesignStudio 的 Proposal 系统 + DevSystem 的文件编辑器：

```
┌─────────────────────────────────────────────┐
│  📄 页面设计: order-list (订单列表)            │
├─────────────────────────────────────────────┤
│  Tab: [设计决策] [rule.json] [pagedata.json] │
│       [script.js] [style.css] [预览]         │
├─────────────────────────────────────────────┤
│                                             │
│  ── 设计决策 Tab ──                           │
│  ┌───────────────────────────────────────┐  │
│  │ 📊 数据模型                            │  │
│  │ ✅ 订单主表 (Orders)                   │  │
│  │ ✅ 订单项表 (OrderItems)               │  │
│  ├───────────────────────────────────────┤  │
│  │ 🎨 UI 结构                             │  │
│  │ ✅ 主从布局（上表下详情）                │  │
│  │ ⏳ 工具栏配置                           │  │
│  ├───────────────────────────────────────┤  │
│  │ ⚡ 交互逻辑                             │  │
│  │ ⏳ 订单状态流转                         │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  [🚀 生成页面] [🔄 重新设计]                  │
│                                             │
└─────────────────────────────────────────────┘
```

#### 3.3.5 验证预览视图

```
┌─────────────────────────────────────────────┐
│  ✅ 验证: order-list                         │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─ iframe 或路由渲染 ─────────────────────┐ │
│  │                                         │ │
│  │   （实际页面渲染结果）                      │ │
│  │                                         │ │
│  └─────────────────────────────────────────┘ │
│                                             │
│  日志:                                       │
│  🔴 [error] Component 'r-xxx' not found     │
│  🟡 [warn]  DataKey 'Orders@rows' ...       │
│                                             │
│  [🔄 AI 自动修复] [💬 手动反馈] [✅ 确认通过]  │
│                                             │
└─────────────────────────────────────────────┘
```

### 3.4 AI 助手面板（右栏）

取代 DevAiPanel，整合 AiDesignStudio 的对话 + Proposal 能力：

```typescript
interface AiPanelMode {
  systemPrompt: string             // 阶段专用 system prompt
  quickActions: QuickAction[]      // 快捷操作按钮
  proposalEnabled: boolean         // 是否启用 Proposal 提取
  autoQueryEnabled: boolean        // 是否启用自动组件查询
}
```

各阶段的完整模式配置、模式切换流程、对话历史管理策略见 [§4.3 AI 对话交互协议](#43-ai-对话交互协议)。

### 3.5 新增 System Prompts

#### 3.5.1 需求理解提示词 (REQUIREMENTS_PROMPT)

```
你是 SPARK 低代码平台的需求分析顾问。

你的任务是帮助用户澄清和结构化业务需求。请通过追问明确以下要素：

1. **业务目标**：这个功能解决什么业务问题？
2. **核心实体**：涉及哪些数据对象（如订单、客户、产品）？
3. **业务场景**：主要操作流程（CRUD? 审批? 统计? 导入导出?）
4. **用户角色**：谁使用这些功能？不同角色有什么区别？
5. **关键约束**：性能要求? 数据量级? 权限控制粒度?

输出格式：用清晰的分类列表回复，每次围绕 1-2 个要素追问。
当所有要素明确后，输出完整的需求摘要请用户确认。
```

#### 3.5.2 功能规划提示词 (FUNCTION_PLANNING_PROMPT)

```
你是 SPARK 低代码平台的功能架构师。

基于用户已确认的需求摘要，规划功能模块和页面。

## 输出格式（JSON）

@@proposal:function-plan
# 功能模块规划
{
  "modules": [
    {
      "name": "订单管理",
      "icon": "📦",
      "description": "订单全生命周期管理",
      "pages": [
        {
          "pageId": "order-list",
          "title": "订单列表",
          "description": "订单查询、筛选、批量操作",
          "pageType": "list",
          "dataEntities": ["Orders", "Customers"]
        }
      ]
    }
  ]
}
@@end

## 规划原则
1. 每个模块聚焦一个业务域
2. 页面粒度：一屏 = 一个核心操作（不要把所有功能塞进一个页面）
3. pageId 用 kebab-case，全局唯一
4. 相关数据实体要在 dataEntities 中声明（后续页面设计会用到）
```

#### 3.5.3 导航设计提示词 (NAVIGATION_DESIGN_PROMPT)

```
你是 SPARK 低代码平台的导航架构师。

基于已确认的功能模块规划，生成导航结构 NavRoot JSON。

## 输出格式

@@proposal:navigation
# 导航结构
{
  "childPlacement": "header",
  "children": [
    {
      "id": "order-center",
      "title": "订单中心",
      "icon": "📦",
      "childPlacement": "sidebar",
      "children": [
        { "id": "order-list", "title": "订单列表", "icon": "📋", "path": "/order-list", "pageId": "order-list" }
      ]
    }
  ]
}
@@end

## 导航设计原则
1. 顶层模块放 header（水平导航），子页面放 sidebar（侧边栏）
2. 每个叶子节点必须有 path 和 pageId
3. 模块节点设 redirect 到第一个子页面的 path
4. 图标用 emoji（与功能语义匹配）
5. 节点 ID 全局唯一，用 kebab-case
```

### 3.6 阶段流转控制

阶段流转的守卫逻辑和完整交互协议见 [§4 交互逻辑与通信协议](#4-交互逻辑与通信协议)。

---

## 4. 交互逻辑与通信协议

> 本章集中描述工程链各阶段的**用户-AI 交互序列**、**`@@` 协议扩展**、**Proposal 生命周期**、**阶段流转守卫**和**错误恢复策略**，是前端实现的核心行为契约。

### 4.1 全局交互序列图

```
 用户                          前端系统                        AI (LLM)                  后端
  │                              │                              │                        │
  │── 输入需求描述 ──────────────→│                              │                        │
  │                              │── POST /api/ai/chat ───────→│                        │
  │                              │  { systemPrompt: REQ_PROMPT, │                        │
  │                              │    messages: [用户描述] }      │                        │
  │                              │←─── AI 追问 / 结构化摘要 ────│                        │
  │←─ 展示 AI 理解 + 追问 ────────│                              │                        │
  │── 确认 / 补充回答 ──────────→│                              │                        │
  │                              │  （循环直到 status='analyzed'）│                        │
  │── 点击「进入功能规划」────────→│                              │                        │
  │                              │── canAdvance('requirements')  │                        │
  │                              │── POST /api/ai/chat ───────→│                        │
  │                              │  { systemPrompt: FUNC_PROMPT, │                        │
  │                              │    context: 需求摘要 }         │                        │
  │                              │←── @@proposal:function-plan ─│                        │
  │←─ 展示功能模块 Proposal ──────│                              │                        │
  │── 采纳 / 调整模块 ─────────→│                              │                        │
  │── 点击「生成导航结构」───────→│                              │                        │
  │                              │── canAdvance('functions')     │                        │
  │                              │── POST /api/ai/chat ───────→│                        │
  │                              │  { systemPrompt: NAV_PROMPT,  │                        │
  │                              │    context: 模块列表 }         │                        │
  │                              │←── @@proposal:navigation ────│                        │
  │←─ 展示导航树 Proposal ───────│                              │                        │
  │── 采纳 / 手动拖拽调整 ──────→│                              │                        │
  │── 点击「保存到后端」─────────→│──── PUT /api/navigation ───────────────────────────→│
  │                              │←─── 200 OK ──────────────────────────────────────────│
  │── 点击「开始页面设计」───────→│                              │                        │
  │                              │── canAdvance('navigation')    │                        │
  │                              │── POST /api/ai/chat/stream ─→│                        │
  │                              │  { systemPrompt: DESIGN_PROMPT,│                       │
  │                              │    context: 页面上下文 }       │                        │
  │                              │←── SSE: @@proposal:* 提案流 ─│                        │
  │←─ 逐条展示 Proposal 卡片 ───│                              │                        │
  │── 逐个 accept / reject ────→│                              │                        │
  │── 点击「生成页面」──────────→│── POST __batch ──────────────────────────────────→│
  │                              │←── 200 OK + SSE: page-updated ──────────────────────│
  │←─ iframe 预览 + 日志 ────────│                              │                        │
  │── 反馈问题 / 确认通过 ──────→│                              │                        │
```

### 4.2 树节点交互协议

项目树是三段式混合树（需求 / 模块 / 导航），不同节点类型触发不同的交互行为：

| 节点类型 | 图标 | 点击行为 | AI 面板响应 |
|---------|------|---------|------------|
| **需求条目** | 📝 | 工作区 → RequirementsView，编辑该需求 | 切换 `requirements` 模式，注入该需求上下文 |
| **模块节点** | 📦 | 工作区 → FunctionPlanView，聚焦该模块 | 切换 `functions` 模式 |
| **页面节点** (`FunctionModule` 下) | 📄 | 工作区 → PageDesignView，加载该页面设计状态 | 切换 `page-design` 模式，注入页面上下文 |
| **导航根节点** | 🌐 | 工作区 → NavigationDesignView | 切换 `navigation` 模式 |
| **导航分支节点** | 🔖 | 工作区 → NavigationDesignView，滚动到该节点 | 同上 |
| **导航叶节点** | 📄 | 同「页面节点」，如果页面已有设计状态 | 切换 `page-design` 模式 |

**拖拽规则**：
- 需求节点之间：可排序
- 模块内页面：可排序
- 模块之间：可排序
- 导航节点：可自由拖拽重组层级（同现有 DevSiteTree）
- **跨区拖拽禁止**：不能把需求拖进模块区，不能把模块拖进导航区

**右键菜单**：
| 节点类型 | 菜单项 |
|---------|--------|
| 需求 | 编辑、删除、AI 重新分析 |
| 模块 | 编辑、删除、添加页面、AI 重新规划 |
| 页面 | 编辑、删除、重新设计、查看已生成文件 |
| 导航 | 添加子节点、删除、编辑属性 |

### 4.3 AI 对话交互协议

#### 4.3.1 模式切换

AI 面板根据 `aiContext.stage` 自动切换模式。每次切换：

```typescript
// 伪代码 — 模式切换时的操作序列
function switchAiMode(newStage: ProjectStage) {
  // 1. 保存当前对话到对应的 chatHistory（如果是 page-design 模式）
  if (currentMode === 'page-design' && activePageId) {
    pageDesignStates.get(activePageId)!.chatHistory = currentMessages
  }
  
  // 2. 更新 system prompt
  aiContext.systemPrompt = STAGE_MODES[newStage].systemPrompt
  
  // 3. 注入新上下文（见 4.3.2）
  aiContext.contextData = buildAiContext(newStage, projectState)
  
  // 4. 加载目标对话历史（page-design 从 pageDesignStates 恢复）
  if (newStage === 'page-design' && activePageId) {
    currentMessages = pageDesignStates.get(activePageId)?.chatHistory ?? []
  } else {
    // requirements / functions / navigation 共享全局对话流
    currentMessages = globalChatHistory[newStage] ?? []
  }
  
  // 5. 更新快捷操作按钮
  quickActions = STAGE_MODES[newStage].quickActions
  
  // 6. 启用/禁用 Proposal 提取
  proposalEnabled = STAGE_MODES[newStage].proposalEnabled
}
```

各阶段的 AI 面板配置（原 §3.4 的 `STAGE_MODES`）：

| 阶段 | System Prompt | 快捷操作 | Proposal | 自动查询 |
|------|--------------|---------|----------|---------|
| requirements | `REQUIREMENTS_PROMPT` | 分析需求 / 列出实体 | ❌ | ❌ |
| functions | `FUNCTION_PLANNING_PROMPT` | 规划模块 / 规划页面 | ✅ `function-plan` | ❌ |
| navigation | `NAVIGATION_DESIGN_PROMPT` | 生成导航 / 优化层级 | ✅ `navigation` | ❌ |
| page-design | `DESIGN_SYSTEM_PROMPT` | 开始设计 / 换方案 | ✅ 全类型 | ✅ |
| verification | `ITERATION_PROMPT` | 自动修复 / 重新生成 | ❌ | ❌ |

#### 4.3.2 上下文注入策略

不同阶段向 AI 注入不同的 contextData，作为 system message 的一部分发送：

```typescript
function buildAiContext(stage: ProjectStage, state: ProjectState): string {
  switch (stage) {
    case 'requirements':
      return '' // 纯自然语言对话，无需注入
      
    case 'functions':
      // 注入已确认的需求摘要
      return state.requirements
        .filter(r => r.status === 'analyzed')
        .map(r => `需求: ${r.title}\n${r.aiSummary}`)
        .join('\n\n')
      
    case 'navigation':
      // 注入功能模块列表（AI 据此生成导航树）
      return JSON.stringify(state.modules, null, 2)
      
    case 'page-design': {
      // 注入当前页面的模块上下文 + 数据实体
      const page = findPagePlan(state, state.activePageId)
      return [
        `当前页面: ${page?.pageId} (${page?.title})`,
        `页面类型: ${page?.pageType}`,
        `相关实体: ${page?.dataEntities?.join(', ')}`,
        `所属模块: ${findModule(state, state.activePageId)?.name}`,
      ].join('\n')
    }
      
    case 'verification':
      return '' // 通过 iterate API 传递实际错误日志
  }
}
```

#### 4.3.3 对话历史管理策略

| 维度 | 策略 | 原因 |
|------|------|------|
| requirements / functions / navigation | **全局对话**（每阶段有独立 history 数组） | 这三个阶段围绕整体项目，对话上下文连续 |
| page-design | **每页独立对话**（存在 `PageDesignState.chatHistory`） | 避免多页面对话混杂导致 token 爆炸 |
| verification | **复用 page-design 对话** + 追加错误日志消息 | 延续设计上下文，便于 AI 理解修复目标 |
| 阶段切换时 | 保存当前 history → 加载目标 history | 支持自由切换不丢失对话 |
| 对话长度限制 | 超过 30 条消息时，自动摘要前 N 条（保留最近 10 条完整） | 防止 token 超限 |

### 4.4 `@@` 协议扩展

#### 4.4.1 现有协议类型

```
@@proposal:data-model        — 数据模型提案
@@proposal:ui-structure      — UI 结构提案
@@proposal:interaction       — 交互逻辑提案
@@proposal:style             — 样式提案
@@proposal:api-config        — API 配置提案
@@proposal:db-schema         — 数据库结构提案
@@proposal:dict-entry        — 字典条目提案
```

#### 4.4.2 新增协议类型

**`@@proposal:function-plan`** — 功能模块规划

```
@@proposal:function-plan
# 功能模块规划
{
  "modules": [
    {
      "name": "订单管理",
      "icon": "📦",
      "description": "订单全生命周期管理",
      "pages": [
        {
          "pageId": "order-list",
          "title": "订单列表",
          "description": "订单查询、筛选、批量操作",
          "pageType": "list",
          "dataEntities": ["Orders", "Customers"]
        },
        {
          "pageId": "order-detail",
          "title": "订单详情",
          "description": "订单信息 + 订单项子表 + 状态流转",
          "pageType": "detail",
          "dataEntities": ["Orders", "OrderItems"]
        }
      ]
    }
  ]
}
@@end
```

**解析规则**：
- `extractBlocks()` 提取 `@@proposal:function-plan` ... `@@end` 块
- 内容部分为 markdown 标题 + JSON 主体
- JSON 中 `modules` 数组必须非空
- 每个 `pageId` 全局唯一，kebab-case
- `pageType` 枚举：`list | detail | form | dashboard | tree | custom`
- JSON 校验失败时，Proposal 状态标记为 `invalid`，展示解析错误

**`@@proposal:navigation`** — 导航结构

```
@@proposal:navigation
# 导航结构
{
  "childPlacement": "header",
  "children": [
    {
      "id": "order-center",
      "title": "订单中心",
      "icon": "📦",
      "childPlacement": "sidebar",
      "redirect": "/order-list",
      "children": [
        {
          "id": "order-list-nav",
          "title": "订单列表",
          "icon": "📋",
          "path": "/order-list",
          "pageId": "order-list"
        },
        {
          "id": "order-detail-nav",
          "title": "订单详情",
          "icon": "📄",
          "path": "/order-detail",
          "pageId": "order-detail"
        }
      ]
    }
  ]
}
@@end
```

**解析规则**：
- JSON 必须符合 `NavRoot` 结构（`children` 数组，每个节点携带 `id` / `title`）
- 叶子节点必须有 `path` + `pageId`
- 模块节点必须有 `redirect` 指向第一个子页面
- 节点 `id` 全局唯一，kebab-case
- `childPlacement` 枚举：`header | sidebar`

#### 4.4.3 协议解析管线

新增两个协议类型需在 `ProposalType` 枚举和 `useDesignSession.extractBlocks` 中注册：

```typescript
// useDesignSession.ts 中新增
type ProposalType = 
  | 'data-model' | 'ui-structure' | 'interaction' | 'style'
  | 'api-config' | 'db-schema' | 'dict-entry'
  | 'function-plan'   // ← 新增
  | 'navigation'      // ← 新增

// responsePipeline.ts — ProposalValidator 处理器扩展
// 为 function-plan / navigation 添加 JSON Schema 校验
const PROPOSAL_VALIDATORS: Record<string, (content: string) => ValidationResult> = {
  'function-plan': validateFunctionPlanJSON,
  'navigation': validateNavigationJSON,
  // ... 其他类型沿用现有校验 ...
}
```

### 4.5 Proposal 生命周期

#### 4.5.1 状态流转

```
                         ┌──────── reject ────────┐
                         │                        ▼
  [AI 生成] ──→ pending ──┬──── accept ────→ accepted ──→ applied
                         │                                   │
                         └──── modify ────→ pending (v2)     │
                                                             │
                  invalid ←── JSON校验失败                    │
                                                             ▼
                                               written (文件已写入后端)
```

| 状态 | 含义 | 用户可操作 |
|------|------|-----------|
| `pending` | AI 刚输出，等待用户审批 | accept / reject / modify |
| `accepted` | 用户已采纳 | 等待生成阶段自动 apply |
| `rejected` | 用户已拒绝 | 可重新让 AI 生成替代方案 |
| `applied` | 已合并到页面配置预览 | 可回退 (unapply) |
| `written` | 已通过 `__batch` API 写入后端 | 不可逆（只能发新版本覆盖） |
| `invalid` | JSON 校验失败 | 查看错误详情，要求 AI 修正 |

#### 4.5.2 各阶段的 Proposal 处理

| 阶段 | 可出现的 Proposal 类型 | accept 动作 |
|------|----------------------|-------------|
| functions | `function-plan` | 解析 JSON → 写入 `state.modules`，同步到项目树 |
| navigation | `navigation` | 解析 JSON → 写入 `state.navRoot`，同步到导航树 UI |
| page-design | `data-model` / `ui-structure` / `interaction` / `style` / `api-config` | 合并到页面设计状态的 proposals 集合 |
| verification | 无新 Proposal | — |

#### 4.5.3 function-plan accept 详细流程

```typescript
function acceptFunctionPlan(proposal: DesignProposal) {
  const plan = JSON.parse(proposal.content) as { modules: FunctionModule[] }
  
  // 1. 合并到 state.modules（保留已有模块的设计进度）
  for (const newMod of plan.modules) {
    const existing = state.modules.find(m => m.name === newMod.name)
    if (existing) {
      // 合并页面列表（新增 + 保留已有进度）
      for (const newPage of newMod.pages) {
        if (!existing.pages.find(p => p.pageId === newPage.pageId)) {
          existing.pages.push({ ...newPage, status: 'planned' })
        }
      }
    } else {
      state.modules.push({ ...newMod, status: 'planned' })
    }
  }
  
  // 2. 更新项目树
  refreshProjectTree()
  
  // 3. 标记 proposal 状态
  proposal.status = 'accepted'
  
  // 4. 自动保存到 localStorage
  // （由 watch 的 debounce 触发）
}
```

#### 4.5.4 navigation accept 详细流程

```typescript
function acceptNavigation(proposal: DesignProposal) {
  const navRoot = JSON.parse(proposal.content) as NavRoot
  
  // 1. 写入 state.navRoot
  state.navRoot = navRoot
  state.navDirty = true  // 标记未同步到后端
  
  // 2. 更新项目树的导航区
  refreshProjectTree()
  
  // 3. 标记 proposal 状态
  proposal.status = 'accepted'
  
  // 4. ⚠️ 不自动保存到后端 — 等用户显式点击「保存到后端」
  //    原因：导航结构影响全局路由，需要用户手动确认
}

// 用户点击「保存到后端」时：
async function saveNavToBackend() {
  await fetch('/api/navigation', {
    method: 'PUT',
    body: JSON.stringify(state.navRoot)
  })
  state.navDirty = false   // 清除脏标记
  // proposal.status → 'written'
}
```

### 4.6 阶段流转守卫

#### 4.6.1 前进守卫 (canAdvance)

```typescript
// src/views/dev-system/composables/useStageFlow.ts

type AdvanceResult = { allowed: true } | { allowed: false; reason: string }

function canAdvance(from: ProjectStage, state: ProjectState): AdvanceResult {
  switch (from) {
    case 'requirements':
      if (!state.requirements.some(r => r.status === 'analyzed'))
        return { allowed: false, reason: '请先让 AI 分析并确认至少一个需求' }
      return { allowed: true }
      
    case 'functions':
      if (!state.modules.some(m => m.pages.length > 0))
        return { allowed: false, reason: '请先规划至少一个包含页面的功能模块' }
      return { allowed: true }
      
    case 'navigation':
      if (state.navDirty)
        return { allowed: false, reason: '请先保存导航结构到后端' }
      return { allowed: true }
      
    case 'page-design': {
      const ps = state.pageDesignStates.get(state.activePageId ?? '')
      if (!ps?.proposals.some(p => p.status === 'accepted'))
        return { allowed: false, reason: '请先采纳至少一个设计提案' }
      return { allowed: true }
    }
      
    default:
      return { allowed: true }
  }
}
```

**用户交互**：点击进度条中的下一阶段按钮 → 调用 `canAdvance()` → 不通过时 `$page.showMessage(reason, 'warning')` 并阻止切换。

#### 4.6.2 回退策略 (canRegress)

用户可自由回退到任何已完成的阶段，但需要理解影响：

```typescript
function canRegress(to: ProjectStage, state: ProjectState): AdvanceResult {
  // 回退到 functions 或 requirements 时，如果已有 navigation/page-design 数据，
  // 弹确认框告知：「修改模块规划可能使已有的导航结构和页面设计失效」
  if (to === 'requirements' || to === 'functions') {
    const hasDownstreamData = 
      state.navRoot.children.length > 0 ||
      state.pageDesignStates.size > 0
    if (hasDownstreamData) {
      return {
        allowed: false, // 需要用户确认后才放行
        reason: '修改模块规划可能使已有的导航结构和页面设计失效，是否继续？'
      }
    }
  }
  return { allowed: true }
}
```

**回退不清除数据**——只切换视图。用户在早期阶段的修改可能导致后续阶段不一致，但由用户自行决定是否重新生成。

#### 4.6.3 阶段跳转规则

| 跳转 | 允许 | 条件 |
|------|------|------|
| 相邻前进 (① → ②) | ✅ | canAdvance 通过 |
| 跳跃前进 (① → ③) | ❌ | 必须逐步完成 |
| 任意回退 (④ → ①) | ✅ | canRegress 确认（有下游数据时弹警告） |
| 通过树节点跳转 | ✅ | 点击页面节点可直接跳到 page-design |
| 进度条点击已完成阶段 | ✅ | 直接切换，不弹警告 |

### 4.7 SSE 与实时事件

#### 4.7.1 AI 流式响应 (chat/stream)

页面设计阶段使用 SSE 流式接收 AI 输出：

```
POST /api/ai/chat/stream
↓
event:delta
data:{"delta":"@@"}

event:delta
data:{"delta":"proposal:ui-structure"}

event:delta
data:{"delta":"\n# 表格布局\n..."}
...
event:delta
data:{"delta":"\n@@end"}

event:done
data:{"usage":{"total_tokens":1234}}
```

**前端处理**：
1. `useAiChat.ts` 逐 chunk 拼接到 `accumulatedContent`
2. 每次 chunk 到达时尝试 `extractBlocks(accumulatedContent)` 提取已完成的 `@@...@@end` 块
3. 完成的块立即送入 `responsePipeline` 进行校验 + Proposal 构造
4. Proposal 卡片实时出现在 AI 面板中（不等待完整响应）

#### 4.7.2 页面配置热更新 (SSE events)

```
GET /api/pages-config/__events
↓
event:page-updated
data:{"pageId":"order-list","file":"rule.json","timestamp":1234567890}
```

**前端处理**：
- 验证预览视图中，iframe 监听该事件 → 自动 reload
- 导航设计视图中，监听 `route-registered` 事件 → 更新可用路由列表

#### 4.7.3 错误恢复

| 错误场景 | 恢复策略 |
|---------|---------|
| SSE 连接中断 | 3 次自动重连（指数退避 1s/2s/4s），失败后展示「重新连接」按钮 |
| AI 返回无效 JSON | Proposal 标记 `invalid`，展示解析错误，用户可要求 AI 重新生成 |
| `__batch` 写入失败 | 弹错误消息 + 保留 proposals 在内存中，用户可重试 |
| 后端 Navigation API 500 | 弹错误消息，保留 `navDirty = true`，用户可重试保存 |
| Token 超限 (LLM 429/413) | 自动截断对话历史（保留最近 10 条），提示用户上下文已压缩 |

### 4.8 快捷操作按钮交互

每个阶段的快捷操作按钮触发预定义 prompt 发送给 AI：

```typescript
interface QuickAction {
  label: string         // 按钮文字
  action: string        // 动作 ID
  promptTemplate: string // 模板内容（可含 {{variable}}）
}

// 示例：requirements 阶段
const REQ_ACTIONS: QuickAction[] = [
  {
    label: '分析需求',
    action: 'analyze',
    promptTemplate: '请分析以下需求，列出核心实体、业务场景和用户角色：\n\n{{requirementDescription}}'
  },
  {
    label: '列出实体',
    action: 'entities',
    promptTemplate: '基于当前需求讨论，请列出所有数据实体及其关键字段'
  }
]
```

**触发流程**：用户点击快捷按钮 → 模板变量替换 → 作为用户消息发送 → AI 按当前 systemPrompt 响应。

---

## 5. 数据流、持久化与后端同步

### 5.1 持久化范围

| 数据 | 存储位置 | 生命周期 | 说明 |
|------|---------|---------|------|
| `requirements[]` | localStorage | 跨刷新保留 | 需求列表 + AI 摘要 |
| `modules[]` | localStorage | 跨刷新保留 | 功能模块规划 |
| `currentStage` | localStorage | 跨刷新保留 | 当前工程链阶段 |
| `pageDesignStates` | localStorage | 跨刷新保留 | 每页的 Proposals + 设计进度 |
| `chatHistory` (全局) | localStorage | 跨刷新保留 | 需求/功能/导航阶段的对话 |
| `chatHistory` (每页) | localStorage | 跨刷新保留 | 页面设计阶段的对话 |
| `navRoot` | **后端** (`/api/navigation`) | 永久 | 导航树结构 |
| `navDirty` | 内存 (reactive) | 刷新丢失 | 导航是否有未保存修改 |
| 页面配置文件 | **后端** (`/api/pages-config`) | 永久 | rule.json / pagedata.json / script.js / style.css |
| AI streaming 临时 buffer | 内存 | 刷新丢失 | SSE chunk 拼接缓冲 |
| Proposal 临时状态 | 内存 (在 localStorage pageDesignStates 刷新后恢复) | 跨刷新保留 | pending/accepted 状态 |

#### 5.1.1 不持久化的数据（刷新即丢失）

- `aiPanelVisible`：AI 面板展开状态（默认隐藏）
- `navDirty`：刷新后从后端重新加载 navRoot，脏标记重置
- SSE 流缓冲：中断的 AI 响应不恢复（用户需重新发送）
- iframe 预览状态：重新加载

### 5.2 localStorage 存储策略

```typescript
const STORAGE_KEY = 'spark-dev-project'
const STORAGE_VERSION = 1

interface PersistedProject {
  version: typeof STORAGE_VERSION
  requirements: Requirement[]
  modules: FunctionModule[]
  currentStage: ProjectStage
  pageDesignStates: Record<string, SerializedPageDesignState>
  globalChatHistory: Record<ProjectStage, ChatMessage[]>
  lastUpdated: string   // ISO timestamp
}

/** 序列化的页面设计状态（ChatMessage 中的 Date → string） */
interface SerializedPageDesignState {
  pageId: string
  proposals: SerializedProposal[]
  phase: SessionPhase
  chatHistory: SerializedChatMessage[]
}
```

**自动保存**（debounce 1s，避免频繁写入）：

```typescript
const debouncedSave = useDebounceFn(() => {
  const data: PersistedProject = {
    version: STORAGE_VERSION,
    requirements: toRaw(state.requirements),
    modules: toRaw(state.modules),
    currentStage: state.currentStage,
    pageDesignStates: serializePageStates(state.pageDesignStates),
    globalChatHistory: serializeGlobalHistory(state.globalChatHistory),
    lastUpdated: new Date().toISOString(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}, 1000)

watch(projectState, debouncedSave, { deep: true })
```

**恢复加载**（组件 setup 时）：

```typescript
function loadFromStorage(): Partial<ProjectState> | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  
  try {
    const data = JSON.parse(raw) as PersistedProject
    
    // 版本迁移
    if (data.version < STORAGE_VERSION) {
      return migrateStorage(data)
    }
    
    return deserializeProjectState(data)
  } catch {
    // JSON 损坏 — 清除并从零开始
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}
```

#### 5.2.1 版本迁移策略

```typescript
const MIGRATIONS: Record<number, (data: unknown) => unknown> = {
  // version 0 → 1: 初始版本，无需迁移
  // version 1 → 2: 示例（未来扩展）
  // 2: (data) => { /* add new fields, transform structures */ }
}

function migrateStorage(data: { version: number }): Partial<ProjectState> | null {
  let current = data
  for (let v = data.version; v < STORAGE_VERSION; v++) {
    const migrator = MIGRATIONS[v + 1]
    if (!migrator) {
      // 无法迁移 — 清除旧数据
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    current = migrator(current) as { version: number }
  }
  return deserializeProjectState(current as PersistedProject)
}
```

#### 5.2.2 存储容量与清理

- localStorage 限制约 5-10 MB（因浏览器而异）
- 单项目预估占用：~200KB（含对话历史）
- **超限保护**：写入时 `try/catch`，QuotaExceededError 时：
  1. 先清除最旧的 chatHistory（按 lastUpdated 排序）
  2. 仍然超限则弹出警告，建议导出备份

#### 5.2.3 多 Tab 冲突处理

```typescript
// 监听 storage 事件（其他 tab 写入时触发）
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY && e.newValue) {
    const remote = JSON.parse(e.newValue) as PersistedProject
    // 策略：后写入者胜（last-write-wins）
    // 如果远程 lastUpdated > 本地 lastUpdated，弹确认框：
    // 「其他标签页更新了项目数据，是否加载最新版本？」
    if (remote.lastUpdated > state.lastUpdated) {
      showConflictDialog(remote)
    }
  }
})
```

#### 5.2.4 导出 / 导入备份

```typescript
// 导出为 JSON 文件
function exportProject() {
  const data = localStorage.getItem(STORAGE_KEY)
  if (!data) return
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  // 触发下载: spark-project-{date}.json
  const a = document.createElement('a')
  a.href = url
  a.download = `spark-project-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// 从 JSON 文件导入
function importProject(file: File) {
  const reader = new FileReader()
  reader.onload = () => {
    const data = JSON.parse(reader.result as string) as PersistedProject
    // 版本校验 + 迁移
    // 弹确认框：「导入将覆盖当前项目数据，是否继续？」
    applyImportedState(data)
  }
  reader.readAsText(file)
}
```

### 5.3 后端 API 复用

所有后端交互继续使用**现有 API**，不新增 Java 端点：

| 操作 | 复用 API | 说明 |
|------|---------|------|
| 导航 CRUD | `GET/PUT /api/navigation` | 导航设计阶段保存 |
| 节点 CRUD | `POST/PUT/DELETE /api/navigation/nodes/{id}` | 节点级操作 |
| 页面配置 | `GET/PUT /api/pages-config/{pageId}/{file}` | 文件编辑 |
| 页面批量写 | `POST /api/pages-config/{pageId}/__batch` | 生成后写入 |
| AI 对话 | `POST /api/ai/chat` | 需求分析 + 功能规划 |
| AI 流式 | `POST /api/ai/chat/stream` | 页面设计对话 |
| SSE 事件 | `GET /api/pages-config/__events` | 热更新 |
| 页面列表 | `GET /api/pages-config/__list` | 页面总览 |

### 5.4 前后端数据同步时序

| 数据 | 同步方向 | 触发时机 | 冲突策略 |
|------|---------|---------|---------|
| NavRoot | 前端 → 后端 | 用户点击「保存到后端」 | 前端覆盖后端（用户操作为准） |
| NavRoot | 后端 → 前端 | 页面加载时 `GET /api/navigation` | 后端为准（前端 localStorage 不存 navRoot） |
| 页面配置 | 前端 → 后端 | Proposal accepted → 点击「生成页面」→ `POST __batch` | 前端覆盖后端 |
| 页面配置 | 后端 → 前端 | 文件编辑器打开时 `GET /api/pages-config/{pageId}/{file}` | 后端为准 |

> **关键设计决策**：`navRoot` **不存入 localStorage**——后端是导航的唯一权威源。前端只在内存中持有从后端加载的副本 + 用户的未保存修改（`navDirty`）。刷新后重新从后端加载。

---

## 6. 文件结构变更

### 6.1 新增文件

```
src/views/dev-system/
├── DevWorkbench.vue              ← 新主组件（替代 DevSystem.vue）
├── composables/
│   ├── useProjectState.ts        ← 项目状态管理
│   ├── useStageFlow.ts           ← 阶段流转控制
│   └── useAiWorkContext.ts       ← AI 上下文构建
├── components/
│   ├── ProjectTree.vue           ← 项目树（左栏）
│   ├── WorkspacePanel.vue        ← 工作区路由（中栏）
│   ├── RequirementsView.vue      ← 需求分析视图
│   ├── FunctionPlanView.vue      ← 功能规划视图
│   ├── NavigationDesignView.vue  ← 导航设计视图
│   ├── PageDesignView.vue        ← 页面设计视图（整合 Proposal）
│   ├── VerificationView.vue      ← 验证预览视图
│   ├── WorkbenchAiPanel.vue      ← AI 助手面板（右栏）
│   └── StageProgressBar.vue      ← 阶段进度指示器
└── prompts/
    ├── requirements-prompt.ts    ← 需求理解提示词
    ├── function-planning-prompt.ts ← 功能规划提示词
    └── navigation-design-prompt.ts ← 导航设计提示词
```

### 6.2 保留文件

```
src/composables/
├── useAiChat.ts                  ← 直接复用
├── useDesignSession.ts           ← 核心复用（Proposal 机制）
├── responsePipeline.ts           ← 直接复用
└── componentPropsCatalog.ts      ← 直接复用

src/components/
├── AiChatPanel.vue               ← 保留（App.vue 快捷入口）
├── AiChatWidget.vue              ← 保留（通用问答）
├── AiDesignStudio.vue            ← 保留但逻辑提取到 composable
└── AiProposalCard.vue            ← 直接复用（提案卡片 UI）

src/views/dev-system/
├── DevNodeProps.vue              ← 保留增强
├── DevSiteTree.vue               ← 重命名为 NavTreeEditor.vue
└── useDevState.ts                ← 拆分到 composables/
```

### 6.3 废弃文件

```
src/views/SiteManager.vue         ← 能力合并到 NavigationDesignView
src/views/NavModuleManager.vue    ← 能力合并到 NavigationDesignView
src/views/dev-system/DevSystem.vue ← 替换为 DevWorkbench.vue
src/views/dev-system/DevAiPanel.vue ← 替换为 WorkbenchAiPanel.vue
```

---

## 7. 路由变更

```typescript
// src/config/routes.ts 变更

// 原有
{ path: '/dev-system', component: DevSystem }

// 新增
{ path: '/dev', component: DevWorkbench, meta: { title: '开发工作台' } }
// /dev-system 保留为旧链接重定向
{ path: '/dev-system', redirect: '/dev' }
```

---

## 8. 实施计划

### Phase 0: 基础设施（预计 1 个 PR）

- [ ] 创建 `composables/useProjectState.ts`（核心状态管理）
- [ ] 创建 `composables/useStageFlow.ts`（阶段流转）
- [ ] 创建 `composables/useAiWorkContext.ts`（AI 上下文）
- [ ] 增加 localStorage 持久化逻辑
- [ ] 单元测试覆盖阶段流转守卫

### Phase 1: UI 骨架（预计 1 个 PR）

- [ ] 创建 `DevWorkbench.vue`（三栏布局骨架）
- [ ] 创建 `ProjectTree.vue`（需求 + 模块 + 导航 混合树）
- [ ] 创建 `WorkspacePanel.vue`（工作区视图路由）
- [ ] 创建 `StageProgressBar.vue`（进度指示器）
- [ ] 路由注册 `/dev`

### Phase 2: 需求 → 功能链（预计 1 个 PR）

- [ ] 创建 `RequirementsView.vue`（需求输入/分析 UI）
- [ ] 创建 `FunctionPlanView.vue`（模块/页面规划 UI）
- [ ] 创建需求理解提示词 + 功能规划提示词
- [ ] AI 面板模式切换逻辑
- [ ] `@@proposal:function-plan` 协议解析

### Phase 3: 导航设计链（预计 1 个 PR）

- [ ] 创建 `NavigationDesignView.vue`（导航编辑器）
- [ ] 从 SiteManager 提取导航树编辑能力
- [ ] 创建导航设计提示词
- [ ] `@@proposal:navigation` 协议解析
- [ ] 导航保存到后端 + 自动同步

### Phase 4: 页面设计链（预计 1 个 PR）

- [ ] 创建 `PageDesignView.vue`（整合 Proposal + 文件编辑）
- [ ] 复用 useDesignSession + responsePipeline
- [ ] AI 面板整合 Proposal 提取/展示
- [ ] 生成 → 写入 → 热更新闭环

### Phase 5: 验证 + 闭环（预计 1 个 PR）

- [ ] 创建 `VerificationView.vue`（预览 + 日志）
- [ ] 整合 PageLogCollector 日志查看
- [ ] AI 自动纠错循环（复用 AIPageLoop）
- [ ] 手动迭代反馈

### Phase 6: 清理 + 文档（预计 1 个 PR）

- [ ] 废弃 SiteManager / NavModuleManager（添加重定向）
- [ ] DevSystem → DevWorkbench 迁移完成
- [ ] 更新 architecture 文档
- [ ] 更新 copilot-instructions.md

---

## 9. 关键设计决策（待讨论）

### Q1: 是否保留 AiDesignStudio 抽屉作为独立入口？

**方案 A**：保留 — AiDesignStudio 继续作为 App.vue 的快捷设计入口（直接跳过需求/功能规划，适合单页快速设计）  
**方案 B**：废弃 — 所有设计操作统一走 DevWorkbench

**建议**：方案 A。AiDesignStudio 对「已明确知道要什么页面」的用户仍有价值，与工程链的页面设计阶段（④）可共享 composable 逻辑。

### Q2: 功能规划产出是否持久化到后端？

**方案 A**：仅前端 localStorage 持久化（开发阶段足够，无需后端变更）  
**方案 B**：通过文件 API 存储为 JSON（如 `POST /api/pages-config/__project-state`）

**建议**：方案 A 先行。后端不修改是硬约束，且项目规划状态作为开发辅助工具，localStorage 生命周期足够。

### Q3: AI 对话历史是否跨阶段保留？

**方案 A**：每个阶段独立对话（切换阶段时清空聊天，注入新的 system prompt）  
**方案 B**：全局连续对话（所有阶段共享一条对话流，阶段切换时追加上下文消息）  
**方案 C**：每页面独立对话 + 全局上下文注入

**建议**：方案 C。功能拆解/导航设计是全局对话，进入页面设计后每页独立对话。这样避免对话过长（token 爆炸），同时保留页面设计的上下文连续性。

### Q4: 项目树与导航树的关系？

**方案 A**：项目树包含导航树（导航是项目树的一个子节点）  
**方案 B**：项目树和导航树并列（两个不同的 tab 或视图）

**建议**：方案 A。统一在一棵树里更直观，且点击导航节点可以快速跳到对应页面的设计视图。

### Q5: 是否需要「项目」级别的概念（多项目切换）？

**建议**：暂不引入。当前系统是单站点模式，一个 NavRoot 对应一个站点。未来如需多项目，可在项目树顶层增加项目选择器，但不在本次重构范围内。

### Q6: 新增 `@@proposal:function-plan` 和 `@@proposal:navigation` 协议块？

> **已在 §4.4 中正式规范**——包含 JSON Schema、解析规则和校验策略。此处仅保留决策记录。

现有协议类型：`data-model | ui-structure | interaction | style | api-config | db-schema | dict-entry`

需要新增：
- `function-plan` — 功能模块规划（JSON），详见 [§4.4.2](#442-新增协议类型)
- `navigation` — 导航结构（JSON），详见 [§4.4.2](#442-新增协议类型)

**建议**：新增。这两个类型在 ProposalType 中注册，复用 extractBlocks / proposalsFromBlocks 解析管线。完整 Proposal 生命周期见 [§4.5](#45-proposal-生命周期)。

---

## 10. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 重构范围大（6 个 Phase） | 开发周期长，中间状态不稳定 | 每个 Phase 独立可用，不破坏现有功能 |
| localStorage 丢失状态 | 用户清 cache 后规划进度丢失 | 导航已持久化到后端；规划状态可导出 JSON 备份（§5.2.4） |
| localStorage 容量超限 | 写入失败，数据丢失 | 超限保护 + 自动清理旧对话（§5.2.2） |
| 多 Tab 数据冲突 | 两个 Tab 同时编辑导致覆盖 | storage 事件监听 + last-write-wins 确认框（§5.2.3） |
| AI 输出不稳定（功能规划/导航） | 生成的 JSON 格式不一致 | ResponsePipeline 增加 JSON Schema 校验处理器（§4.4.3） |
| 页面设计上下文过长 | DeepSeek token 限制 | 分页面独立对话 + 摘要压缩（§4.3.3） |
| 现有 AiDesignStudio 用户迁移 | 习惯的操作方式变化 | 保留 AiDesignStudio 为独立入口兼容 |
| SSE 连接不稳定 | AI 响应中断 / 热更新丢失 | 指数退避重连 + 错误恢复策略（§4.7.3） |
| 阶段流转回退导致数据不一致 | 修改模块后导航/页面设计过时 | 回退弹警告但不清数据，由用户决定重新生成（§4.6.2） |

---

## 附录 A：术语表

| 术语 | 定义 |
|------|------|
| **工程链** | 从用户需求到可运行页面的完整流程 |
| **需求** (Requirement) | 用户的业务需求条目 |
| **功能模块** (FunctionModule) | AI 规划的功能域，包含多个页面 |
| **页面规划** (PagePlan) | 功能模块下的单页描述 |
| **导航结构** (NavRoot) | SPARK 标准导航模型 JSON |
| **设计提案** (Proposal) | AI 在页面设计阶段提出的结构化方案 |
| **工作台** (Workbench) | DevSystem 升级后的统一开发界面 |
