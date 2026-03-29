# SPARK AI 驱动全生命周期配置生成方案

> **目标**：以 AI 生成配置、不写代码为核心，实现业务系统从需求到上线的全流程 AI 定制。
>
> **对标**：Claude Artifacts / GitHub Copilot Workspace / Cursor Composer / v0.dev / Bolt.new

---

## 一、现状深度分析

### 1.1 SPARK 已具备的 AI 能力矩阵

| 层面 | 已实现能力 | 成熟度 | 对标产品 |
|------|-----------|--------|---------|
| **页面 UI 配置** | AI 生成 `rule.json`（组件树 + 布局 + 样式） | ★★★★☆ | v0.dev |
| **数据模型配置** | AI 生成 `pagedata.json`（DataSet + 表 + 列 + 关系 + 聚合） | ★★★★☆ | - |
| **交互行为脚本** | AI 生成 `script.js`（沙箱脚本，事件驱动） | ★★★☆☆ | Bolt.new |
| **页面样式** | AI 生成 `style.css`（scoped CSS） | ★★★☆☆ | v0.dev |
| **协同设计会话** | `@@ 定界协议`、6 阶段门控、提案审阅 | ★★★☆☆ | Copilot Workspace |
| **实时预览热更新** | SSE 推送 → 缓存清除 → 路由刷新 | ★★★★☆ | Bolt.new |
| **自动纠错循环** | 日志收集 → AI 分析 → 自动迭代（最多 3 轮） | ★★★☆☆ | Cursor |
| **两阶段生成** | Phase-1（UI层）→ Phase-2（数据/行为层）→ 可选自迭代 | ★★★★☆ | - |
| **组件元数据** | 构建时自动提取 → Skill Prompt 注入 | ★★★★☆ | - |
| **流式推理透出** | SSE delta/reasoning/phase 事件，DeepSeek 推理链可视化 | ★★★★☆ | Claude |
| **多租户隔离** | X-Tenant-Id / X-Project-Id 请求隔离 | ★★★☆☆ | - |

### 1.2 当前能力架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        用户交互层                                    │
│  ┌──────────────┐  ┌───────────────────┐  ┌──────────────────────┐  │
│  │ AiChatPanel  │  │ AiDesignStudio    │  │ AiChatWidget         │  │
│  │ (快速生成)    │  │ (协同设计会话)     │  │ (通用对话)            │  │
│  └──────┬───────┘  └────────┬──────────┘  └──────────┬───────────┘  │
│         │                   │                        │              │
│  ┌──────▼───────────────────▼────────────────────────▼───────────┐  │
│  │                   spark-ai 包（前端 AI 引擎）                   │  │
│  │  ┌─────────────┐ ┌──────────────┐ ┌───────────────────────┐   │  │
│  │  │ AIPageLoop  │ │ ResponsePipe │ │ DesignSession         │   │  │
│  │  │ (闭环编排)   │ │ (响应管线)    │ │ (提案解析/验证)        │   │  │
│  │  └──────┬──────┘ └───────┬──────┘ └───────────┬───────────┘   │  │
│  │         │                │                    │               │  │
│  │  ┌──────▼────────────────▼────────────────────▼───────────┐   │  │
│  │  │ PageLogCollector │ ComponentPropsCatalog │ PageCache    │   │  │
│  │  └────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────┬────────────────────────────────┘  │
│                                 │ SSE / REST                        │
├─────────────────────────────────┼───────────────────────────────────┤
│                        后端 AI 服务层                                │
│  ┌──────────────────────────────▼────────────────────────────────┐  │
│  │                   spark-ai-server (Spring Boot)                │  │
│  │  ┌─────────────────┐  ┌──────────────────┐  ┌────────────┐   │  │
│  │  │ AiPageService   │  │ AiStreamService  │  │ SseService │   │  │
│  │  │ (两阶段生成)     │  │ (通用流式对话)    │  │ (事件广播)  │   │  │
│  │  └────────┬────────┘  └────────┬─────────┘  └─────┬──────┘   │  │
│  │           │                    │                   │          │  │
│  │  ┌────────▼────────────────────▼───────────────────▼──────┐   │  │
│  │  │ PageConfigService │ ComponentMetadataService │ NavSvc  │   │  │
│  │  │ (文件 CRUD)       │ (元数据持久化)            │ (导航)  │   │  │
│  │  └────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                        配置运行时层                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  PageConfigLoader → parsePageData → DataSet → DataView → UI  │  │
│  │  SparkPageRenderer → SparkComponentRenderer → 容器/字段组件    │  │
│  │  Sandbox(script.js) → $dataSet / $page / $route                │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 与主流 AI 开发平台的对比差距

| 维度 | v0.dev / Bolt.new | Copilot Workspace | SPARK 现状 | **差距** |
|------|-------------------|-------------------|-----------|---------|
| **需求→UI** | 自然语言→完整页面 | PR 级代码生成 | ✅ 自然语言→4 文件配置 | 接近 |
| **数据库建模** | 不支持 | 不涉及 | ⚠️ 仅内存 DataSet | **需扩展到真实 DB Schema** |
| **API 对接** | 不支持 | 不涉及 | ⚠️ DataTable.api 手动配 | **需 AI 自动配置 API 端点** |
| **导航菜单** | 不支持 | 不涉及 | ⚠️ 手动管理 | **需 AI 自动注册导航** |
| **权限配置** | 不支持 | 不涉及 | ⚠️ 框架已就绪，无 AI 生成 | **需 AI 生成权限矩阵** |
| **工作流/审批** | 不支持 | 不涉及 | ❌ 未实现 | **需增加工作流配置** |
| **多页面应用** | 单页面 | 多文件 PR | ⚠️ 单页面生成 | **需跨页面联动生成** |
| **部署上线** | Vercel 一键部署 | PR → CI/CD | ❌ 无部署流程 | **需版本管理+发布** |
| **版本管理** | Git 自动提交 | PR/Branch | ❌ 无版本控制 | **需配置版本快照** |
| **可视化编辑** | 拖拽编辑器 | 代码编辑器 | ❌ 仅 AI+JSON | **需可视化编排辅助** |
| **国际化** | 不支持 | 不涉及 | ❌ 未实现 | **需 AI 生成 i18n 配置** |

### 1.4 现实约束与落地原则（API-first，2026-03）

为避免方案落入“先改后端再落地”的高成本路径，本方案新增以下硬约束：

1. **先复用现有 API**：可通过现有接口完成的能力，默认只改前端编排与配置，不新增后端端点。
2. **迁移显式触发**：历史数据迁移仅允许前端显式调用 API 触发，禁止后端启动期隐式迁移。
3. **多租户优先路径**：统一优先使用 `/api/tenants/{tenantId}/projects/{projectId}/...`。
4. **兼容路径有上下文前提**：使用 `/api/pages-config/**` 时必须携带 `X-Tenant-Id`、`X-Project-Id`。
5. **写入优先批量接口**：`pages-config` 写操作优先 `__batch`，降低重绑与事件风暴。
6. **fail-fast**：异常必须显式暴露，不允许静默兜底掩盖根因。

> 现有后端完整 API 基线见：`docs/guides/API_FIRST_PROMPT.md`。

### 1.5 术语与边界定义（优化①）

| 术语 | 本文定义 | 非目标（避免范围蔓延） |
|------|----------|------------------------|
| **全生命周期** | 覆盖 ①~⑩ 的配置生成与演进闭环 | 不等于一次性实现所有阶段 |
| **上线** | 配置发布可用 + 可回滚 + 可观测 | 不等于复杂 CI/CD 平台建设 |
| **自动化** | 默认 AI 编排 + 人工可介入 | 不追求“无人值守绝对自动” |
| **企业级** | 可治理（审计、回滚、权限、隔离） | 不等于首期引入全部治理模块 |

**范围约束**：
- 本文优先解决“配置生成与治理闭环”，不展开业务域建模细节（如行业特定流程）。
- 未进入 `Now/Next/Later` 且无验收标准的能力，视为探索项，不纳入承诺排期。

---

## 二、全生命周期 AI 配置生成架构设计

### 2.1 全流程总览：从需求到上线的 10 个阶段

```
┌───────────────────────────────────────────────────────────────────┐
│                    AI 驱动全生命周期配置生成                        │
│                                                                   │
│  ① 需求理解    ② 数据建模    ③ API 配置    ④ UI 设计              │
│  ──────────→  ──────────→  ──────────→  ──────────→              │
│                                                                   │
│  ⑤ 交互行为    ⑥ 权限配置    ⑦ 导航注册    ⑧ 多页面联动            │
│  ──────────→  ──────────→  ──────────→  ──────────→              │
│                                                                   │
│  ⑨ 验证发布    ⑩ 需求变更与二次策划                                 │
│  ──────────→  ──────────→  持续演进 🔄                             │
└───────────────────────────────────────────────────────────────────┘
```

### 2.2 渐进式开发：阶段独立性与多入口设计

10 个阶段**不是必须从左到右全部走完**的流水线。核心设计原则是：每个阶段独立有价值，缺少上游阶段时自动降级（而非报错），随时可向上补全。

#### 阶段依赖矩阵（⇒ = 强依赖，⇢ = 可选增强）

```
①蓝图   ②数据   ③API   ④UI   ⑤交互   ⑥权限   ⑦导航   ⑧多页面   ⑨验证   ⑩变更
①           ⇢      ⇢    ⇢    ⇢      ⇢      ⇢      ⇒        ⇢      ⇢
②                  ⇢    ⇒    ⇢      ⇢               ⇢       ⇢
③                       ⇢    ⇢                       ⇢       ⇢
④                            ⇒      ⇢      ⇢              ⇒      ⇢
⑤                                                          ⇢      ⇢
⑥                                                          ⇢      ⇢
⑦                                                          ⇢      ⇢
⑧                                                          ⇒      ⇢
⑨                                                                 ⇢
```

**唯一强依赖**：
- ④ UI → ② 数据（rule.json 的 dataKey 必须有对应 pagedata.json）
- ⑤ 交互 → ④ UI（script.js 引用的事件/组件必须存在于 rule.json）
- ⑧ 多页面 → ① 蓝图（批量生成需知道模块规划）
- ⑨ 验证 → ④ UI（至少要有页面配置才能验证）

**其余全部是可选增强**：缺少时自动降级。

#### 四种入口点（用户可从任意层级开始）

| 入口 | 起点阶段 | 适用场景 | 后续可扩展 |
|------|---------|---------|----------|
| **单页面快速生成** | ④⑤ | “帮我做个客户列表页” | → 补蓝图 → 扩展为模块 |
| **模块级规划** | ①→②→④→⑤ | “做一个客户管理系统” | → 补权限 → 补 API |
| **已有页面补能力** | ⑥⑦③ | “给现有页面加权限控制” | → 变更管理 |
| **全自动一键生成** | ①→⑩ | “一键生成完整应用” | → 迭代优化 |

#### 阶段缺失时的自动降级策略

| 缺失阶段 | 降级行为 | 用户感知 |
|---------|---------|----------|
| ① 蓝图缺失 | 单页面生成正常工作，仅无法批量生成模块 | AI 提示“创建蓝图可解锁多页面批量生成” |
| ② 数据模型简化 | AI 自动推断 pagedata.json（现有能力），无 db-schema 映射 | 透明，与现有体验一致 |
| ③ API 缺失 | pagedata.json 使用内联数据（静态 rows），无远程加载 | 页面可用但数据为示例数据 |
| ⑥ 权限缺失 | 所有字段可见可编辑，无脱敏 | 透明，全权限状态 |
| ⑦ 导航缺失 | 页面可通过 URL 直接访问，不在菜单中显示 | AI 提示“是否注册到导航菜单？” |
| ⑨ 验证缺失 | 配置直接生效，无完整性检查 | AI 通过日志自纠错代替 |
| ⑩ 变更缺失 | 用户手动修改或用单页面 iterate，无跨页面编排 | 与现有体验一致 |

#### 向上补全（后期激活更高阶段）

已有单页面配置可随时向上补全缺失的阶段，AI 从已有配置中反向推断：

```
场景：用户已有 5 个独立页面，现在想统一管理

用户: "把这 5 个页面整合成一个客户管理系统"

AI 反向补全流程：
  1. 扫描已有 5 个 pagedata.json → 提取实体/关系
  2. 自动生成 app-blueprint.json（反向推断模块划分）
  3. 自动生成 db-schema.json（从 columnDefs 反向推断）
  4. 自动注册导航节点（按模块分组）
  5. 生成 permission-config.json（默认全权限，用户后续调整）
  → 无需重新生成页面，仅补充上游配置
```

#### 手动配置与 AI 生成的兼容性

| 场景 | 处理方式 |
|------|----------|
| 手写 rule.json + AI 生成 pagedata.json | ✅ 完全兼容，配置格式统一 |
| 先 AI 生成再手动微调 JSON | ✅ AI iterate 模式会保留手动修改 |
| 部分页面手写、部分 AI 生成 | ✅ 同一 DataSet 规范，混合使用无冲突 |
| 现有 vue-component 页面 + AI config 页面 | ✅ NavNode.pageType 区分，路由层透明 |
| 手动编辑导航树 + AI 自动注册 | ✅ addNode 校验 id 唯一性，不会覆盖已有节点 |

### 2.3 十大配置层详细设计

---

#### 阶段 ① 需求理解与应用规划（AI Application Planner）

**目标**：AI 从自然语言需求中提取应用蓝图，生成 `app-blueprint.json`。

**当前状态**：AiDesignStudio 有 6 阶段门控流程，但无应用级规划输出。

**新增配置类型**：`app-blueprint.json`
```jsonc
{
  "appName": "客户管理系统",
  "description": "面向销售团队的客户关系管理平台",
  "modules": [
    {
      "id": "customer-mgmt",
      "name": "客户管理",
      "pages": [
        {
          "pageId": "customer-list",
          "title": "客户列表",
          "type": "master-detail",         // list | master-detail | tree | dashboard | form
          "entities": ["Customer", "Contact"],
          "features": ["search", "crud", "export", "import"],
          "parentPage": null
        },
        {
          "pageId": "customer-detail",
          "title": "客户详情",
          "type": "form",
          "entities": ["Customer", "Contact", "Order"],
          "features": ["edit", "tabs", "timeline"],
          "parentPage": "customer-list"
        }
      ]
    },
    {
      "id": "order-mgmt",
      "name": "订单管理",
      "pages": [...]
    }
  ],
  "sharedEntities": ["User", "Department", "Dictionary"],
  "roles": ["admin", "sales", "viewer"],
  "navigationStructure": "sidebar-header"   // 导航布局模式
}
```

**AI Prompt 策略**：
```
用户输入: "我需要一个客户管理系统，包含客户列表、客户详情、订单管理、销售报表"

AI 输出:
  1. 确认模块划分（客户/订单/报表）
  2. 识别实体关系（Customer → Contact, Customer → Order）
  3. 推断页面类型（列表→master-detail, 报表→dashboard）
  4. 生成 app-blueprint.json
```

**实现路径**：
- 在 `spark-ai` 包中新增 `BlueprintGenerator`
- 扩展 `DesignSession` 的 `ProposalType`，新增 `'app-blueprint'`
- 蓝图提案通过 `@@proposal:app-blueprint` 协议输出

##### ① → ⑦ 蓝图直接对接导航配置系统（可行性评估）

`app-blueprint.json` 的 module/page 结构可以**无损转换**为 `NavNode` 树并通过已有 `NavigationService.addNode()` API 注入导航系统。

**字段映射表**：

| `app-blueprint.json` 字段 | NavNode 字段 | 映射方式 | 说明 |
|---|---|---|---|
| `modules[].id` | `NavNode.id` | 直接映射 | 模块 ID → 导航 group 节点 ID |
| `modules[].name` | `NavNode.title` | 直接映射 | 模块名 → 导航组标题 |
| `modules[].pages[].pageId` | `NavNode.id` + `NavNode.pageId` | 直接映射 | 页面 ID 同时用作节点 ID 和 pageId |
| `modules[].pages[].title` | `NavNode.title` | 直接映射 | |
| `modules[].pages[].type` | `NavNode.nodeKind` | 需推断 | 所有蓝图页面类型统一映射为 `nodeKind: "page"` |
| `modules[].pages[].parentPage` | 树嵌套层级 | 结构映射 | `parentPage` 非 null → 嵌套为父节点的 children + `nodeKind: "sub-page"` |
| `navigationStructure` | `NavRoot.childPlacement` | 直接映射 | `"sidebar-header"` → 根 `"header"`，模块 `"sidebar"` |
| （自动推导） | `NavNode.path` | 默认规则 | `path = "/" + pageId` |
| （自动推导） | `NavNode.pageType` | 默认 `"config"` | AI 生成的页面统一为 config 类型 |
| （AI 推断） | `NavNode.icon` | 语义推断 | AI 根据模块/页面名称推断 icon |
| （自动推导） | `NavNode.redirect` | 首子页 path | group 节点 redirect 自动取第一个 child 的 path |

**结构映射示例**：

```jsonc
// app-blueprint.json 输入
{
  "modules": [{
    "id": "customer-mgmt",
    "name": "客户管理",
    "pages": [
      { "pageId": "customer-list", "title": "客户列表", "type": "master-detail", "parentPage": null },
      { "pageId": "customer-detail", "title": "客户详情", "type": "form", "parentPage": "customer-list" }
    ]
  }]
}

// 转换后 NavNode 子树
{
  "id": "customer-mgmt",
  "type": "group",
  "title": "客户管理",
  "icon": "Briefcase",               // AI 推断
  "nodeKind": "module",
  "childPlacement": "sidebar",
  "redirect": "/customer-list",      // 自动取首子页
  "children": [
    {
      "id": "customer-list",
      "type": "item",
      "title": "客户列表",
      "path": "/customer-list",
      "pageId": "customer-list",
      "pageType": "config",
      "nodeKind": "page",
      "children": [
        {
          "id": "customer-detail",
          "type": "item",
          "title": "客户详情",
          "path": "/customer-detail",
          "pageId": "customer-detail",
          "pageType": "config",
          "nodeKind": "sub-page"       // parentPage → sub-page
        }
      ]
    }
  ]
}
```

**可行性结论**：

| 维度 | 结论 |
|------|------|
| 字段覆盖度 | ✅ NavNode 已包含蓝图所需全部字段，**无需扩展类型** |
| API 就绪度 | ✅ `addNode(tenantId, projectId, parentId, node, index)` 支持嵌套插入 |
| 节点种类 | ✅ `VALID_NODE_KINDS` 包含 `module`/`page`/`sub-page`，完全匹配蓝图二级结构 |
| 幂等安全 | ✅ addNode 校验 id 唯一性，重复注册 catch 跳过即可 |

**核心转换函数** `blueprintToNavNodes()`（约 40~50 行）：
1. 遍历 `modules[]` → 生成 group NavNode（`type: "group"`, `nodeKind: "module"`, `childPlacement: "sidebar"`）
2. 遍历 `pages[]` → 生成 item NavNode（`path: "/" + pageId`, `pageType: "config"`）
3. `parentPage` 非 null 的页面嵌套到对应父节点 children 中
4. 每个 group 的 `redirect` 自动取第一个 child 的 path

**数据流**：
```
app-blueprint.json           （设计时：AI 规划产物）
   ├─→ 驱动多页面批量生成      （阶段 ④~⑥）
   └─→ blueprintToNavNodes()  （纯函数，blueprint → NavNode[]）
        ↓
   navigation-patch.json      （每页面附属产物，随 AiResponse.files 输出）
        ↓
   前端编排层解析 patch 并调用导航 API（POST /navigation/nodes）
        ↓
   前端主动拉取导航树（GET /navigation）并刷新
```

> **设计决策**：蓝图作为独立文件保留（承载 entities/features/roles 等语义规划信息），导航树是运行时路由结构——两者职责不同，通过 `blueprintToNavNodes()` 桥接而非合并。

---

#### 阶段 ② 数据建模（AI Data Modeler）

**目标**：AI 从业务实体生成完整 `pagedata.json`，包含表结构、关系、计算列、聚合。

**当前状态**：★★★★ 已有 DataSet/DataTable/DataView/DataRelation 全套基础设施，AI 可生成 `pagedata.json`。

**需要增强的维度**：

##### 2a. 数据库 Schema 映射配置（新增）

```jsonc
// 新增配置文件：db-schema.json（每个模块一份）
{
  "entities": {
    "Customer": {
      "tableName": "t_customer",           // 数据库物理表名
      "columns": [
        { "name": "id",         "dbColumn": "id",          "type": "number", "isPrimaryKey": true, "autoIncrement": true },
        { "name": "name",       "dbColumn": "customer_name","type": "string", "maxLength": 100, "required": true },
        { "name": "phone",      "dbColumn": "phone",       "type": "string", "mask": "phone" },
        { "name": "email",      "dbColumn": "email",       "type": "string", "mask": "email" },
        { "name": "level",      "dbColumn": "customer_level","type": "string", "dict": "customer_level" },
        { "name": "createTime", "dbColumn": "create_time", "type": "datetime", "autoFill": "create" },
        { "name": "updateTime", "dbColumn": "update_time", "type": "datetime", "autoFill": "update" }
      ],
      "indexes": [
        { "name": "idx_phone", "columns": ["phone"], "unique": true },
        { "name": "idx_level", "columns": ["customer_level"] }
      ]
    }
  },
  "relations": [
    {
      "type": "one-to-many",
      "parent": "Customer",
      "child": "Contact",
      "foreignKey": "customer_id",
      "cascadeDelete": false
    }
  ],
  "dictionaries": {
    "customer_level": [
      { "value": "A", "label": "VIP客户", "color": "#e6a23c" },
      { "value": "B", "label": "普通客户", "color": "#409eff" },
      { "value": "C", "label": "潜在客户", "color": "#909399" }
    ]
  }
}
```

##### 2b. 从 db-schema 自动推导 pagedata.json

```
db-schema.json (实体模型)
  ↓ AI + SchemaTransformer
pagedata.json (前端数据模型)
  ├── tables: 从 entities 映射
  ├── columns: 从 db columns 映射（补充 label/computeExpression）
  ├── views.default: 自动生成视图配置
  ├── relations: 从 db relations 映射到 DataRelation
  └── aggregates: AI 根据数据类型推断聚合配置
```

**实现路径**：
- 新增 `SchemaTransformer` 服务（Java 端），将 `db-schema.json` → `pagedata.json` 的列/关系映射自动化
- AI 只需生成 `db-schema.json`，运行时自动推导前端数据模型
- 在 `system-prompt.txt` 中增加 db-schema 输出规范

---

#### 阶段 ③ API 端点配置（AI API Configurator）

**目标**：AI 自动生成 API 配置，让 DataTable 可直接对接后端服务。

**当前状态**：DataTable.api 支持 CRUD + 树操作端点（`list/create/update/delete/children/path/subtree/nestedSearch`），但需要手动配置 URL。

**新增配置类型**：`api-config.json`（每页面一份）
```jsonc
{
  "endpoints": {
    "Customer": {
      "baseUrl": "/api/customers",
      "operations": {
        "list":   { "method": "GET",    "url": "/api/customers",        "params": { "page": "page", "size": "pageSize" } },
        "create": { "method": "POST",   "url": "/api/customers" },
        "update": { "method": "PUT",    "url": "/api/customers/{id}" },
        "delete": { "method": "DELETE", "url": "/api/customers/{id}" },
        "detail": { "method": "GET",    "url": "/api/customers/{id}" },
        "export": { "method": "GET",    "url": "/api/customers/export", "responseType": "blob" },
        "import": { "method": "POST",   "url": "/api/customers/import", "contentType": "multipart/form-data" }
      },
      "fieldMapping": {
        "id": "id",
        "name": "customerName",
        "phone": "phone"
      },
      "pagination": {
        "type": "offset",              // offset | cursor | none
        "pageField": "page",
        "sizeField": "size",
        "totalField": "total",
        "dataField": "data.records"    // 响应数据路径
      }
    },
    "Contact": {
      "baseUrl": "/api/contacts",
      "operations": {
        "list": { "method": "GET", "url": "/api/contacts", "params": { "customerId": "{parentRow.id}" } }
      }
    }
  },
  "globalConfig": {
    "baseUrl": "/api",
    "timeout": 10000,
    "headers": { "Content-Type": "application/json" },
    "errorMapping": {
      "401": "redirect:/login",
      "500": "toast:服务器内部错误"
    }
  }
}
```

**AI 生成策略**：
- 从 `app-blueprint.json` 的实体列表推断 RESTful 端点
- 遵循 RESTful 命名约定：`/api/{entity-plural}` + CRUD 动词
- 从 `db-schema.json` 的字段名推断字段映射（驼峰↔下划线）
- 级联表自动生成带 parentField 参数的子端点

**实现路径**：
- 扩展 `DataTable.api` 类型支持完整的 `api-config.json` 格式
- `pagedata.json` 中 `tables.X.api` 字段引用 `api-config.json` 的端点声明
- PageConfigLoader 加载时合并 `api-config.json` → DataTable.api
- 在 `system-prompt.txt` Phase-2 中增加 API 配置输出规范

---

#### 阶段 ④ UI 设计（AI UI Designer）— 已实现，需增强

**当前状态**：★★★★ rule.json 生成成熟。

**需要增强的维度**：

##### 4a. 页面模板库（Template Catalog）

```jsonc
// 新增：templates/master-detail.template.json
{
  "templateId": "master-detail",
  "name": "主从表模板",
  "description": "左侧主表 + 右侧明细表 + 工具栏",
  "variables": {
    "masterTable": { "type": "string", "description": "主表名" },
    "detailTable": { "type": "string", "description": "明细表名" },
    "masterColumns": { "type": "array", "description": "主表列定义" },
    "detailColumns": { "type": "array", "description": "明细表列定义" }
  },
  "ruleTemplate": [
    {
      "type": "div",
      "style": { "display": "flex", "gap": "16px", "height": "100%" },
      "children": [
        {
          "type": "div",
          "style": { "flex": "1" },
          "children": [
            {
              "type": "r-table",
              "dataKey": "{{masterTable}}@rows",
              "props": { "border": true, "highlightCurrentRow": true, "docks": { "toolbar": { "position": "top" } } },
              "children": ["{{masterToolbar}}", "{{masterColumns}}"]
            }
          ]
        },
        {
          "type": "div",
          "style": { "flex": "1" },
          "children": [
            {
              "type": "r-table",
              "dataKey": "{{detailTable}}@rows",
              "props": { "border": true, "stripe": true, "docks": { "toolbar": { "position": "top" } } },
              "children": ["{{detailToolbar}}", "{{detailColumns}}"]
            }
          ]
        }
      ]
    }
  ]
}
```

**预置模板清单**：

| 模板 ID | 场景 | 布局 |
|---------|------|------|
| `list-page` | 单表 CRUD | 工具栏 + 表格 + 分页 |
| `master-detail` | 主从表 | 左右双表 + 关系级联 |
| `tree-table` | 树+表 | 左树 + 右表联动 |
| `dashboard` | 数据看板 | 统计卡 + 图表网格 |
| `form-page` | 表单编辑 | 分组表单 + 提交按钮 |
| `wizard` | 向导流程 | 步骤条 + 表单分步 |
| `approval` | 审批页面 | 表单 + 流程图 + 审批操作栏 |
| `import-export` | 数据导入导出 | 上传区 + 映射表 + 预览 |

##### 4b. 响应式布局智能配置

AI 应自动根据页面类型推断布局策略：
```jsonc
// rule.json 中的响应式断点配置
{
  "type": "div",
  "responsive": {
    "default": { "gridColumns": "repeat(4, 1fr)" },
    "tablet":  { "gridColumns": "repeat(2, 1fr)" },
    "mobile":  { "gridColumns": "1fr" }
  }
}
```

---

#### 阶段 ⑤ 交互行为配置（AI Interaction Designer）— 已实现，需增强

**当前状态**：★★★ script.js 沙箱可生成事件处理逻辑。

**需要增强的维度**：

##### 5a. 声明式交互规则（减少 script.js 代码量）

```jsonc
// 新增配置块：rule.json 中的 interactions（声明式，零代码）
{
  "type": "r-table",
  "dataKey": "Orders@rows",
  "interactions": [
    {
      "trigger": "rowClick",
      "actions": [
        { "type": "navigate", "target": "/order-detail", "params": { "id": "{row.id}" } },
        { "type": "showMessage", "message": "正在加载订单 {row.orderNo}", "level": "info" }
      ]
    },
    {
      "trigger": "selectionChange",
      "condition": "selectedRows.length > 0",
      "actions": [
        { "type": "enable", "target": "batchDeleteBtn" },
        { "type": "updateText", "target": "selectedCount", "value": "已选 {selectedRows.length} 项" }
      ]
    },
    {
      "trigger": "fieldChange",
      "field": "quantity",
      "actions": [
        { "type": "compute", "target": "total", "expression": "price * quantity" },
        { "type": "validate", "rules": [{ "min": 1, "message": "数量不能小于1" }] }
      ]
    }
  ]
}
```

**声明式交互动作类型**：

| 动作类型 | 说明 | 参数 |
|---------|------|------|
| `navigate` | 路由跳转 | target, params, query |
| `showMessage` | 消息提示 | message, level |
| `showConfirm` | 确认对话框 | title, message, onConfirm |
| `showDialog` | 弹出对话框 | pageId or component |
| `enable/disable` | 启禁用控件 | target (组件 name) |
| `show/hide` | 显隐控件 | target |
| `compute` | 计算赋值 | target, expression |
| `validate` | 字段校验 | rules |
| `refreshData` | 刷新数据 | table, view |
| `setFilter` | 设置过滤 | table, field, value |
| `apiCall` | 调用 API | endpoint, params, onSuccess |
| `exportData` | 导出数据 | format, columns |

##### 5b. 业务规则引擎配置

```jsonc
// 新增配置文件：business-rules.json
{
  "rules": [
    {
      "id": "auto-discount",
      "name": "VIP 自动折扣",
      "trigger": { "type": "fieldChange", "table": "Orders", "field": "customerId" },
      "condition": {
        "type": "expression",
        "value": "Customer.currentRow.level === 'A'"
      },
      "actions": [
        { "type": "setValue", "table": "Orders", "field": "discount", "value": 0.9 },
        { "type": "toast", "message": "VIP 客户自动享受 9 折优惠" }
      ]
    },
    {
      "id": "stock-check",
      "name": "库存校验",
      "trigger": { "type": "beforeSave", "table": "OrderItems" },
      "condition": {
        "type": "api",
        "url": "/api/inventory/check",
        "params": { "productId": "{row.productId}", "qty": "{row.quantity}" }
      },
      "actions": [
        { "type": "block", "message": "库存不足，当前库存：{result.stock}" }
      ]
    }
  ]
}
```

---

#### 阶段 ⑥ 权限配置（AI Permission Designer）

**目标**：AI 生成或调整模块级 `permission-config` 工件。

**收口规则**：
- 本文件只保留“何时生成 `permission-config`”这一生命周期信息，不再重复定义权限模型、字段清单、默认值或脱敏规则。
- 具体权限语义、默认值与主键契约统一以 [PERMISSION_SYSTEM.md](PERMISSION_SYSTEM.md) 为准。
- AI 侧输出必须与 [PERMISSION_SYSTEM.md](PERMISSION_SYSTEM.md) 对齐，禁止在系统提示词或方案文档里再维护第二套权限 JSON 样例。

**实现路径**：
- `permission-config.json` 由 AI 在阶段 ① 蓝图确认后生成或在后续迭代中调整
- 后端 API 读取 `permission-config.json` 并向响应注入 `_perm` / `_modelPerm`
- 前端按统一权限体系渲染，不在本文件内重复解释
- `system-prompt.txt` 仅声明“输出需遵循 [PERMISSION_SYSTEM.md](PERMISSION_SYSTEM.md)”

---

#### 阶段 ⑦ 导航注册（AI Navigation Builder）

**目标**：AI 自动将新页面注册到导航树中。

**当前状态**：NavigationService 已支持节点 CRUD，但 AI 生成页面后不自动注册导航。

**自动化流程**：
```
AI 生成页面配置
  ↓ 成功保存
前端 AI 编排层调用现有导航 API（POST /navigation/nodes）
  ├── pageId → path 映射
  ├── 从 app-blueprint.json 确定所属模块
  ├── 推断 icon（基于页面类型和模块语义）
  ├── 计算排序位置（同级末尾 or 指定位置）
  └── 前端收到响应后主动刷新导航树（必要时订阅 SSE）
```

**AI 生成导航配置**（作为页面生成的附属输出）：
```jsonc
// 在 AiResponse.files 中新增 navigation-patch.json
{
  "node": {
    "id": "customer-list",
    "type": "item",
    "title": "客户列表",
    "icon": "User",
    "path": "/customer-list",
    "parentId": "customer-mgmt",        // 所属模块
    "sortOrder": 1
  },
  "createParentIfMissing": true,         // 父模块不存在时自动创建
  "parentDefaults": {
    "type": "group",
    "title": "客户管理",
    "icon": "Briefcase",
    "childPlacement": "sidebar"
  }
}
```

**实现路径**：
- 在 `spark-ai` 前端编排层中，页面保存成功后直接调用导航多租户接口：
  - `POST /api/tenants/{tenantId}/projects/{projectId}/navigation/nodes`
- 复用现有后端 `NavigationController`，不新增 Controller 端点
- 导航更新后前端主动拉取：
  - `GET /api/tenants/{tenantId}/projects/{projectId}/navigation`
- 若页面场景使用 SSE，则仅将 `navigation-updated` 作为可选增强（非阻塞依赖）

**需要补充的 4 个连接点**：

| 连接点 | 现状 | 需要做的 |
|--------|------|----------|
| 前端编排调用点 | 页面生成后仅刷新页面，不处理导航 | 在生成成功回调追加 `POST /navigation/nodes` |
| navigation-patch.json 解释器 | `writeBatch` 仅处理页面文件 | 由前端解释 `navigation-patch.json` 并拆分为 API 请求 |
| createParentIfMissing 逻辑 | 父节点不存在会失败 | 前端先查询导航树，不存在则先创建 group 再创建页面节点 |
| 导航刷新策略 | 页面刷新与导航刷新分离 | 新增导航刷新步骤（拉取新树 + 局部渲染更新） |

**预估改动量**：约 2~3 个前端文件、~80 行代码（AiChatPanel/编排层 + navigation service）。

---

#### 阶段 ⑧ 多页面联动生成（AI Multi-Page Orchestrator）

**目标**：AI 一次性生成整个模块的所有页面配置，确保跨页面数据一致性。

**当前状态**：目前只能单页面逐个生成。

**多页面编排协议**：
```jsonc
// AI 输出扩展：multi-page response
{
  "pages": {
    "customer-list": {
      "files": {
        "rule.json": "...",
        "pagedata.json": "...",
        "script.js": "...",
        "style.css": "..."
      }
    },
    "customer-detail": {
      "files": {
        "rule.json": "...",
        "pagedata.json": "...",
        "script.js": "...",
        "style.css": "..."
      }
    },
    "customer-form": {
      "files": { ... }
    }
  },
  "sharedData": {
    "db-schema.json": "...",           // 共享数据模型
    "api-config.json": "...",          // 共享 API 配置
    "permission-config.json": "...",   // 共享权限配置
    "dictionaries.json": "..."         // 共享字典
  },
  "navigation": [
    { "id": "customer-list",   "parentId": "customer-mgmt", "sortOrder": 1 },
    { "id": "customer-detail", "parentId": "customer-mgmt", "sortOrder": 2 },
    { "id": "customer-form",   "parentId": "customer-mgmt", "sortOrder": 3 }
  ],
  "explanation": "客户管理模块包含 3 个页面：列表（主从表）、详情（只读）、编辑表单"
}
```

**跨页面数据共享机制**：
- `#scope` DataKey 前缀：`#SharedDS@Orders@rows`
- 模块级 `db-schema.json` 确保实体定义一致
- 共享字典（`dictionaries.json`）保证选项统一
- 页面间导航参数自动传递（`$route.query.id`）

**实现路径**：
- 新增 `AiModuleService` 处理多页面生成请求
- 扩展 `AiChatRequest` 增加 `scope: 'page' | 'module' | 'app'`
- 批量调用 `PageConfigService.writeBatch()` + `NavigationService.addNode()`
- 共享配置（db-schema / api-config / permission-config）存储在文件系统：`data/pages-config/{tenant}/{project}/__shared/{moduleId}/`
- 蓝图（app-blueprint.json）存储在 H2 DB（`BlueprintEntity`），通过 REST API 读写

---

#### 阶段 ⑨ 验证与发布（AI Validator & Publisher）

**目标**：AI 自动验证配置完整性，生成版本快照，支持发布/回滚。

##### 9a. 配置完整性验证

```jsonc
// AI 验证清单（自动执行）
{
  "checks": [
    { "type": "datakey-consistency", "desc": "所有 dataKey 引用的表/视图在 pagedata.json 中存在" },
    { "type": "handler-existence",   "desc": "所有事件处理函数在 script.js 中存在" },
    { "type": "render-existence",    "desc": "所有 Render* 组件在 script.js 中有对应函数" },
    { "type": "component-registered","desc": "所有组件类型在注册表中存在" },
    { "type": "relation-integrity",  "desc": "DataRelation 的父/子表和字段都存在" },
    { "type": "pk-defined",          "desc": "有级联关系的表定义了 isPrimaryKey" },
    { "type": "api-reachable",       "desc": "配置的 API 端点可达（health check）" },
    { "type": "permission-complete", "desc": "所有角色对所有实体都有权限定义" },
    { "type": "navigation-linked",   "desc": "所有页面在导航树中有对应节点" },
    { "type": "css-scoped",          "desc": "style.css 所有选择器含 [data-page] 前缀" }
  ]
}
```

##### 9b. 版本管理

> **存储策略**：版本元数据（version / changelog / manifest）存入 H2 DB（`VersionEntity`），
> 版本快照内容（配置文件完整副本）存入文件系统（`__versions/v1.2.0/snapshot/`）。

```jsonc
// VersionEntity.manifestJson 内容示例（存 DB CLOB）
{
  "version": "1.2.0",
  "publishedAt": "2026-03-16T10:30:00Z",
  "publishedBy": "admin",
  "changelog": "新增客户管理模块（3 个页面）",
  "pages": {
    "customer-list":   { "hash": "a1b2c3", "lastModified": "2026-03-16T10:25:00Z" },
    "customer-detail": { "hash": "d4e5f6", "lastModified": "2026-03-16T10:28:00Z" },
    "customer-form":   { "hash": "g7h8i9", "lastModified": "2026-03-16T10:30:00Z" }
  },
  "sharedConfigs": {
    "db-schema.json":         { "hash": "j0k1l2" },
    "api-config.json":        { "hash": "m3n4o5" },
    "permission-config.json": { "hash": "p6q7r8" }
  },
  "previousVersion": "1.1.0"
}
```

##### 9c. 发布流程

```
AI 验证通过
  ↓
DB: 写入 VersionEntity（version/changelog/manifestJson）
  ↓
文件: 创建配置快照（__versions/v1.2.0/snapshot/...）
  ↓
更新 current → 指向新版本
  ↓
SSE 广播 version-published 事件
  ↓
前端清除所有缓存 → 重新加载
```

---

#### 阶段 ⑩ 需求变更与二次策划（AI Change Planner）

**目标**：已上线应用收到需求变更时，AI 自动完成影响分析、增量策划、安全变更与回归验证，实现「变更即配置」的持续演进闭环。

**当前状态**：现有 `iterate` 模式仅支持单页面 feedback→增量修改，缺乏跨页面/跨配置层的变更编排。

##### 10a. 变更请求分析（Change Request Analyzer）

```jsonc
// 用户输入变更请求，AI 生成 change-request.json
{
  "requestId": "CR-20260316-001",
  "description": "客户列表增加批量导入功能；订单表增加折扣字段；销售角色可导入但不可导出",
  "analyzedAt": "2026-03-16T14:00:00Z",

  // AI 自动拆解为独立变更单元
  "changeUnits": [
    {
      "id": "CU-1",
      "summary": "客户列表 — 增加批量导入按钮",
      "scope": "single-page",
      "affectedStages": ["④ UI", "⑤ 交互", "⑥ 权限"],
      "affectedFiles": [
        { "pageId": "customer-list", "file": "rule.json",    "action": "modify", "reason": "toolbar 新增导入按钮" },
        { "pageId": "customer-list", "file": "script.js",   "action": "modify", "reason": "新增 handleImport 函数" },
        { "type": "shared",  "file": "permission-config.json", "action": "modify", "reason": "sales 角色增加 import 权限" }
      ],
      "risk": "low",
      "dependencies": []
    },
    {
      "id": "CU-2",
      "summary": "订单表 — 增加折扣字段 + 计算列调整",
      "scope": "cross-page",
      "affectedStages": ["② 数据模型", "③ API", "④ UI"],
      "affectedFiles": [
        { "type": "shared",  "file": "db-schema.json",     "action": "modify", "reason": "Order 表增加 discount 列" },
        { "type": "shared",  "file": "api-config.json",    "action": "modify", "reason": "Order 端点响应新增 discount 字段" },
        { "pageId": "order-list",    "file": "pagedata.json", "action": "modify", "reason": "columns 新增 discount + 计算列 total 调整" },
        { "pageId": "order-list",    "file": "rule.json",     "action": "modify", "reason": "el-table-column 新增折扣列" },
        { "pageId": "customer-detail","file": "pagedata.json","action": "modify", "reason": "订单子表显示折扣列" }
      ],
      "risk": "medium",
      "dependencies": []
    },
    {
      "id": "CU-3",
      "summary": "权限调整 — sales 可导入不可导出",
      "scope": "shared-config",
      "affectedStages": ["⑥ 权限"],
      "affectedFiles": [
        { "type": "shared", "file": "permission-config.json", "action": "modify", "reason": "sales 角色 import=true, export=false" }
      ],
      "risk": "low",
      "dependencies": ["CU-1"]
    }
  ],

  // 影响摘要
  "impactSummary": {
    "totalFiles": 7,
    "pagesAffected": ["customer-list", "order-list", "customer-detail"],
    "sharedConfigsAffected": ["db-schema.json", "api-config.json", "permission-config.json"],
    "maxRisk": "medium",
    "estimatedStages": ["②", "③", "④", "⑤", "⑥"]
  }
}
```

##### 10b. 二次策划增量蓝图（Re-planning Blueprint Patch）

变更不重新生成完整蓝图，而是生成 **增量补丁**：

```jsonc
// blueprint-patch.json（蓝图增量变更）
{
  "baseVersion": "1.2.0",
  "patchDescription": "CR-20260316-001 增量变更",

  // 蓝图级变更：新增/修改/删除 模块或页面
  "modulePatches": [
    {
      "moduleId": "customer-mgmt",
      "action": "modify",
      "pagePatches": [
        {
          "pageId": "customer-list",
          "action": "modify",
          "featuresDelta": { "add": ["import"], "remove": [] }
        }
      ]
    },
    {
      "moduleId": "order-mgmt",
      "action": "modify",
      "entityPatches": [
        {
          "entity": "Order",
          "columnsDelta": {
            "add": [{ "name": "discount", "type": "number", "label": "折扣率" }],
            "modify": [{ "name": "total", "computeExpression": "price * qty * (1 - discount)" }]
          }
        }
      ]
    }
  ],

  // 权限增量
  "permissionPatches": [
    {
      "role": "sales",
      "delta": {
        "customer-list": { "allowImport": true, "allowExport": false }
      }
    }
  ]
}
```

##### 10c. 安全变更执行策略

> **存储策略**：变更请求元数据（状态/分析/补丁）存入 H2 DB（`ChangeRequestEntity` + `ChangeUnitEntity`），
> 变更前文件备份存入文件系统（`__changes/{CR-id}/pre-snapshot/`）。

```
变更请求 (自然语言)
  ↓
DB: 创建 ChangeRequestEntity (status=analyzing)
  ↓
AI 变更分析 → DB: 更新 analysisJson（影响评估）
  ↓
用户确认变更范围（可调整/拒绝部分 changeUnit）
  ↓
AI 二次策划 → DB: 更新 blueprintPatchJson（增量蓝图）
  ↓
文件: 创建变更前备份（__changes/{CR-id}/pre-snapshot/）  ← ⚠️ 自动备份
  ↓
按依赖顺序执行变更单元：
  DB: ChangeUnitEntity.CU-N (status=running → success/failed)
  CU-2（数据模型 → API → UI，跨页面原子性）
  CU-1（单页面 UI + 交互）
  CU-3（权限配置，依赖 CU-1 完成）
  ↓
每个 CU 完成后：
  ├── 自动验证受影响文件（阶段 ⑨ 验证器复用）
  ├── SSE 推送变更进度
  └── 失败时自动回滚该 CU（从 pre-{CR-id} 恢复受影响文件）
  ↓
全部 CU 通过 → 回归验证（全配置一致性检查）
  ↓
版本发布 v1.3.0（changelog 自动从 changeUnits 生成）
```

**关键设计决策**：

| 决策 | 选择 | 原因 |
|------|------|------|
| 变更粒度 | 按 changeUnit 逐个执行 | 失败时可单独回滚，不影响其他变更 |
| 执行顺序 | 按 dependencies DAG 拓扑排序 | 确保数据模型先于 UI、权限后于功能 |
| 回滚策略 | pre-CR 快照 + 文件级细粒度恢复 | 比整版本回滚更精确，保留未受影响的功能改进 |
| 蓝图更新 | 增量 patch 而非全量重生成 | 避免 AI 幻觉导致已稳定功能被意外修改 |
| 导航变更 | 仅新增页面时触发 addNode | 修改现有页面不触发导航变更，除非显式请求 |

##### 10d. AI 变更 Prompt 策略

```
┌──────────────────────────────────────────────────────────────────┐
│ 变更模式 System Prompt = Layer 0（通用规则）                       │
│   + Layer 8: 变更分析 prompt（新增）                               │
│     - 输入：自然语言变更请求 + 当前 app-blueprint.json             │
│     - 输出：change-request.json（结构化影响分析）                   │
│   + 受影响阶段的 Layer（按 affectedStages 动态组装）               │
│   + 既有配置上下文（受影响文件的当前内容注入）                      │
│   + 约束：只修改 affectedFiles 中列出的文件，禁止修改无关文件       │
└──────────────────────────────────────────────────────────────────┘
```

**与现有 iterate 模式的区别**：

| 维度 | 现有 iterate | 阶段 ⑩ 需求变更 |
|------|-------------|----------------|
| 范围 | 单页面 | 跨页面 + 跨配置层 |
| 输入 | feedback 文本 | 结构化 changeRequest |
| 分析 | 无（直接修改） | change-request.json 影响评估 |
| 安全 | 无快照 | 变更前自动备份 |
| 回滚 | 无 | 按 changeUnit 细粒度回滚 |
| 顺序 | 单文件 | DAG 拓扑排序多文件 |
| 验证 | 日志收集→AI 自检 | 结构化验证 + 回归检查 |

##### 10e. 典型场景

**场景 A：新增功能页面**
```
用户: "客户管理模块增加一个联系人管理页面"

AI 分析:
  - scope: blueprint-extend（蓝图扩展）
  - 新增 contact-list 页面 → 走完阶段 ②~⑦（全新页面流程）
  - 同时修改 customer-detail 页面 → 增加关联跳转按钮（阶段 ④⑤）
  - 导航树自动注册 contact-list 到 customer-mgmt 组
```

**场景 B：字段级变更**
```
用户: "客户表增加微信号字段，列表和详情都要显示"

AI 分析:
  - scope: cross-page（跨页面字段同步）
  - db-schema → Order 表增加 wechat 列
  - pagedata.json × 2 → 增加 wechat 列定义
  - rule.json × 2 → 增加 wechat 展示控件
  - 无权限/导航变更
```

**场景 C：权限策略调整**
```
用户: "viewer 角色也能看客户列表，但手机号要脱敏"

AI 分析:
  - scope: shared-config（仅权限配置）
  - permission-config.json → 调整 viewer 角色的权限快照定义（具体语义以 PERMISSION_SYSTEM.md 为准）
  - 无 UI/数据/导航变更
```

**场景 D：全模块重构**
```
用户: "把订单管理拆成两个子模块：销售订单和采购订单"

AI 分析:
  - scope: blueprint-restructure（蓝图重构）
  - 蓝图级：order-mgmt → sales-order-mgmt + purchase-order-mgmt
  - 页面级：order-list 拆分为 sales-order-list + purchase-order-list
  - 数据层：Order 表拆分为 SalesOrder + PurchaseOrder
  - 导航：删除旧 order-mgmt 组，新增两个组
  - ⚠️ 高风险：全量验证 + 人工确认
```

**实现路径**：
- 第一步（前端优先）：在 `spark-ai` 增加 `change-planner/`，先落地变更拆解 + 依赖排序 + 增量蓝图生成
- 第二步（复用现有 API）：复用 `/api/ai/chat` + `pages-config/__batch` + `navigation/nodes` 完成跨页面变更执行
- 第三步（候选后端增强）：仅在需要持久化变更工单/执行状态时，再新增 `change-request/change-execute` 专用端点
- 扩展 `DesignSession` 的 `ProposalType`，新增 `'change-request'` + `'blueprint-patch'`
- 复用阶段 ⑨ 验证器 作为变更后回归检查

---

## 三、技术实现路线图

### 3.1 API-first 实施清单（先复用，后新增）

#### 3.1.1 第一优先级：直接复用现有后端 API（不新增端点）

| 能力 | 直接复用 API | 说明 |
|------|-------------|------|
| 页面配置生成落盘 | `POST /api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/__batch` | 页面 4 文件及扩展文件统一批量写入 |
| 页面文件读取/回放 | `GET /api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}` | 支持按页面读取配置用于迭代与验证 |
| 路由同步 | `POST /api/tenants/{tenantId}/projects/{projectId}/pages-config/__sync-routes` | 新页面落盘后同步路由 |
| 导航注册 | `POST /api/tenants/{tenantId}/projects/{projectId}/navigation/nodes` | 自动注册菜单节点 |
| 导航回读 | `GET /api/tenants/{tenantId}/projects/{projectId}/navigation` | 注册后刷新导航树 |
| AI 页面生成 | `POST /api/ai/chat` / `POST /api/ai/chat/stream-page` | 保留现有同步/流式两种模式 |
| 通用对话与附件 | `POST /api/ai/chat/stream` / `POST /api/ai/upload` | 复用现有端点 |
| 组件元数据 | `POST /api/ai/component-metadata` / `GET /api/ai/component-metadata` | 构建后上传与状态查询 |
| 通用业务数据 CRUD | `/api/tenants/{tenantId}/projects/{projectId}/data/**` | 先满足 ②/③ 阶段数据对接 |
| 缓存与可观测性 | `GET /api/cache/stats` / `POST /api/cache/clear-metadata` / `POST /api/logs` | 复用运维与日志能力 |

#### 3.1.2 第二优先级：仅在能力缺口明确时新增 API（候选）

| 端点 | 方法 | 用途 | 阶段 |
|------|------|------|------|
| `POST /api/ai/blueprint` | POST | 生成应用蓝图 | ① |
| `POST /api/ai/data-model` | POST | 生成数据模型 | ② |
| `POST /api/ai/api-config` | POST | 生成 API 配置 | ③ |
| `POST /api/ai/permission` | POST | 生成权限配置 | ⑥ |
| `POST /api/ai/module` | POST | 生成整个模块（多页面） | ⑧ |
| `POST /api/ai/validate` | POST | 验证配置完整性 | ⑨ |
| `POST /api/ai/publish` | POST | 发布版本快照 | ⑨ |
| `GET /api/ai/versions` | GET | 版本历史列表 | ⑨ |
| `POST /api/ai/rollback/{version}` | POST | 回滚到指定版本 | ⑨ |
| `GET /api/shared-config/{type}` | GET | 读取共享配置 | ②③⑥ |
| `PUT /api/shared-config/{type}` | PUT | 写入共享配置 | ②③⑥ |
| `POST /api/ai/change-request` | POST | 提交变更请求 → 返回影响分析 | ⑩ |
| `POST /api/ai/change-execute` | POST | 确认并执行变更计划 | ⑩ |
| `GET /api/ai/change-history` | GET | 变更请求历史列表 | ⑩ |

> 说明：`/api/ai/page`、`/api/ai/iterate` 能力可由现有 `/api/ai/chat`（generate/iterate）承载，
> 在没有清晰性能/权限边界诉求前，不建议新增同义端点。

### 3.2 新增 spark-ai 包模块设计

```
packages/spark-ai/src/
├── ai-loop.ts                ← 现有（增强：支持多阶段编排）
├── design-session.ts         ← 现有（增强：新增提案类型）
├── design-prompt.ts          ← 现有（增强：新增阶段规则）
├── response-pipeline.ts      ← 现有（增强：新增验证处理器）
├── component-props-catalog.ts← 现有
├── page-cache.ts             ← 现有
│
├── blueprint/                ← 新增：应用蓝图
│   ├── blueprint-generator.ts     # 蓝图生成编排
│   ├── entity-extractor.ts        # 实体关系提取
│   └── module-planner.ts          # 模块规划器
│
├── data-model/               ← 新增：数据建模
│   ├── schema-generator.ts        # db-schema 生成
│   ├── schema-to-pagedata.ts      # schema → pagedata 转换
│   └── relation-analyzer.ts       # 关系智能分析
│
├── api-config/               ← 新增：API 配置
│   ├── endpoint-generator.ts      # 端点生成器
│   └── field-mapper.ts            # 字段映射推断
│
├── permission/               ← 新增：权限配置
│   ├── permission-generator.ts    # 权限矩阵生成
│   └── role-analyzer.ts           # 角色权限推断
│
├── orchestrator/             ← 新增：多页面编排
│   ├── module-orchestrator.ts     # 模块级编排
│   ├── cross-page-validator.ts    # 跨页面一致性验证
│   └── navigation-planner.ts      # 导航自动规划
│
├── validation/               ← 新增：配置验证
│   ├── config-validator.ts        # 完整性验证器
│   ├── consistency-checker.ts     # 跨文件一致性
│   └── api-health-checker.ts      # API 可达性检查
│
├── change-planner/           ← 新增：需求变更与二次策划
│   ├── change-analyzer.ts         # 变更请求拆解 + 影响分析
│   ├── blueprint-patcher.ts       # 增量蓝图补丁生成
│   ├── dependency-sorter.ts       # 变更单元 DAG 拓扑排序
│   ├── change-executor.ts         # 按 CU 逐步执行 + 单步回滚
│   └── regression-runner.ts       # 变更后回归验证（复用 validation/）
│
└── versioning/               ← 新增：版本管理
    ├── version-manager.ts         # 版本快照管理
    ├── diff-calculator.ts         # 配置差异计算
    └── rollback-handler.ts        # 回滚处理器
```

### 3.3 配置文件完整清单（每页面/每模块）

| 配置文件 | 级别 | 生成阶段 | 用途 |
|---------|------|---------|------|
| `app-blueprint.json` | 应用级 | ① | 应用模块规划 | **DB**（`BlueprintEntity.blueprintJson`） |
| `db-schema.json` | 模块级 | ② | 数据库实体模型 | 文件（`__shared/{moduleId}/`） |
| `api-config.json` | 模块级 | ③ | API 端点配置 | 文件（`__shared/{moduleId}/`） |
| `dictionaries.json` | 模块级 | ② | 字典/枚举定义 | 文件（`__shared/`） |
| `permission-config.json` | 模块级 | ⑥ | 角色权限矩阵 | 文件（`__shared/{moduleId}/`） |
| `rule.json` | 页面级 | ④ | UI 结构+布局+样式 | 文件（`{pageId}/`） |
| `pagedata.json` | 页面级 | ②④ | 前端数据模型 | 文件（`{pageId}/`） |
| `script.js` | 页面级 | ⑤ | 交互行为脚本 | 文件（`{pageId}/`） |
| `style.css` | 页面级 | ④ | 页面专属样式 | 文件（`{pageId}/`） |
| `interactions.json` | 页面级 | ⑤ | 声明式交互规则（可选）| 文件（`{pageId}/`） |
| `business-rules.json` | 模块级 | ⑤ | 业务规则引擎配置 | 文件（`__shared/{moduleId}/`） |
| `navigation-patch.json` | 页面级 | ⑦ | 导航节点定义 | 文件（`{pageId}/`） |
| `version-manifest.json` | 应用级 | ⑨ | 版本发布记录 | **DB**（`VersionEntity.manifestJson`） |
| `change-request.json` | 应用级 | ⑩ | 变更影响分析 | **DB**（`ChangeRequestEntity.analysisJson`） |
| `blueprint-patch.json` | 应用级 | ⑩ | 增量蓝图补丁 | **DB**（`ChangeRequestEntity.blueprintPatchJson`） |

### 3.4 System Prompt 增强策略

当前 `system-prompt.txt` 管控 4 个文件输出。全链路方案需要分层 prompt：

```
┌──────────────────────────────────────────────────────┐
│ Layer 0: 通用规则（输出格式、中文解释、needsIteration） │
├──────────────────────────────────────────────────────┤
│ Layer 1: 蓝图层 prompt                                │
│   - app-blueprint.json 输出规范                       │
│   - 模块识别 + 实体提取 + 页面类型推断                  │
├──────────────────────────────────────────────────────┤
│ Layer 2: 数据层 prompt                                │
│   - db-schema.json + pagedata.json 输出规范            │
│   - 字段类型推断 + 关系识别 + 聚合推断                  │
├──────────────────────────────────────────────────────┤
│ Layer 3: API 层 prompt                                │
│   - api-config.json 输出规范                          │
│   - RESTful 约定 + 分页 + 字段映射                    │
├──────────────────────────────────────────────────────┤
│ Layer 4: UI 层 prompt（现有 system-prompt.txt 核心）    │
│   - rule.json 规范 + 组件优先级 + 嵌套约束             │
├──────────────────────────────────────────────────────┤
│ Layer 5: 行为层 prompt                                │
│   - script.js 沙箱规范 + interactions.json 声明式规则   │
├──────────────────────────────────────────────────────┤
│ Layer 6: 权限层 prompt                                │
│   - permission-config.json 输出规范                    │
│   - 角色推断 + 字段级权限 + 脱敏规则                    │
├──────────────────────────────────────────────────────┤
│ Layer 7: 验证层 prompt                                │
│   - 跨文件一致性自检清单                               │
│   - 错误模式识别 + 自动修复指令                         │
├──────────────────────────────────────────────────────┤
│ Skill Prompt: 组件元数据（构建时自动注入）               │
└──────────────────────────────────────────────────────┘
```

**按阶段动态组装 prompt**：`AiPageService.buildSystemPrompt()` 根据请求的 `scope` 和当前阶段，只注入相关层：
- `scope: 'blueprint'` → Layer 0 + Layer 1
- `scope: 'data-model'` → Layer 0 + Layer 2 + Layer 3
- `scope: 'page'` → Layer 0 + Layer 4 + Layer 5 + Skill Prompt（现有逻辑）
- `scope: 'module'` → Layer 0 + Layer 1~7 + Skill Prompt（全量）
- `scope: 'change-request'` → Layer 0 + Layer 8（变更分析）+ 受影响阶段 Layers + 既有配置上下文

### 3.5 落地顺序（Now / Next / Later）

| 阶段 | 时间窗 | 核心目标 | 是否新增后端端点 |
|------|--------|----------|------------------|
| **Now** | 1-2 周 | 导航自动注册、配置验证器、API-first 编排闭环 | 否（仅复用现有 API） |
| **Next** | 2-6 周 | 蓝图生成、数据模型/权限模板化、多页面编排 | 视缺口而定（优先复用） |
| **Later** | 6 周+ | 变更工单化、版本治理、企业级工作流 | 可能需要（按验证结果引入） |

> 门槛：每阶段都必须满足“可独立交付 + 可回滚 + 可观测（日志/SSE）”。

### 3.6 交付闸门（DoR / DoD，优化②）

#### DoR（开始开发前必须满足）

| 检查项 | 判定标准 |
|--------|----------|
| API 复用评估 | 已完成“复用优先”评审，明确是否需要新增端点 |
| 影响范围 | 已列出受影响页面/共享配置/导航节点 |
| 回滚方案 | 已定义快照或文件级回退路径 |
| 可观测性 | 已定义日志字段与关键事件（至少包含 pageId/tenantId/projectId） |

#### DoD（功能完成必须满足）

| 检查项 | 判定标准 |
|--------|----------|
| 功能可用 | 目标场景端到端可执行（生成→写入→渲染） |
| 一致性验证 | dataKey/handler/render/component 校验通过 |
| 回滚可用 | 人工触发回滚并验证可恢复到稳定状态 |
| 文档同步 | API/流程变更已回写到架构文档与提示词基线 |

---

## 四、AI 交互流程设计

### 4.1 快速模式（单页面生成，现有增强）

```
用户: "帮我创建一个客户管理页面，有列表和详情"

AI (Phase-1): 生成 rule.json + style.css
AI (Phase-2): 生成 pagedata.json + script.js
    ↓ 自动写入 + SSE 热更新
    ↓ 自动纠错循环（日志→AI→迭代，最多3轮）
    ↓ 自动注册导航节点（可选）

完成 ✅ 页面即时可用（无需蓝图/API/权限等前置阶段）
```

### 4.2 协同设计模式（多轮对话，现有增强）

```
用户: "我要做一个客户管理系统"

AI: [@@proposal:app-blueprint] 应用蓝图提案
用户: ✅ 接受 / ❌ 拒绝并补充

AI: [@@proposal:data-model] 数据模型提案
用户: ✅ 接受

AI: [@@proposal:api-config] API 配置提案
用户: ✅ 接受

AI: [@@proposal:ui-structure] UI 布局提案 × 3（列表/详情/表单）
用户: ✅ 接受部分 / 修改

AI: 根据所有已接受提案 → 一键生成全部文件

完成 ✅ 整个模块可用
```

### 4.3 全自动模式（零交互，新增）

```
用户: "一键生成完整的客户管理系统"

AI: 自动执行 ①~⑨ 生产阶段（⑩用于上线后的变更治理）
  ① 生成 app-blueprint.json
  ② 生成 db-schema.json + pagedata.json × N
  ③ 生成 api-config.json
  ④ 生成 rule.json × N + style.css × N
  ⑤ 生成 script.js × N
  ⑥ 生成 permission-config.json
  ⑦ 自动注册导航（N 个节点）
  ⑧ 跨页面一致性校验
  ⑨ 验证 → 创建版本快照

  每阶段结束 SSE 推送进度
  出错时自动迭代修复

完成 ✅ 整个应用可用
```

### 4.4 迭代优化模式（现有增强，单页面）

```
用户: "客户列表页面加一个导出按钮"

AI: 定位目标文件 → 定向修改
  - 识别修改范围（单页面内的 1~4 个文件）
  - 增量更新（只重新生成变化的文件）
  - 日志收集 → 自动纠错循环
```

### 4.5 需求变更模式（新增，跨页面/跨配置层）

```
用户: "订单表加个折扣字段，列表和详情都要显示，sales 角色只读"

AI Phase-A: 变更分析
  → 输出 change-request.json
  → 展示影响范围（3 个页面、2 个共享配置、risk=medium）
  → 用户确认

AI Phase-B: 增量策划
  → 输出 blueprint-patch.json
  → 按依赖排序：db-schema → api-config → pagedata×2 → rule×2 → permission
  → 变更前自动创建版本快照

AI Phase-C: 逐 CU 执行
  → CU-1: 数据模型+API（db-schema.json, api-config.json）
  → CU-2: 订单列表 UI（pagedata.json, rule.json）
  → CU-3: 客户详情子表（pagedata.json, rule.json）
  → CU-4: 权限调整（permission-config.json）
  → 每步完成后自动验证 + SSE 进度推送
  → 失败时回滚该 CU，不影响已成功的步骤

AI Phase-D: 回归验证
  → 阶段 ⑨ 验证器全量运行
  → 通过 → 自动发布新版本 v1.3.0

完成 ✅ 变更上线，自动生成 changelog
```

### 4.6 渐进式扩展模式（新增，从单页成长为应用）

```
用户: "有 3 个独立页面，想组织成一个客户管理系统"

AI Phase-A: 反向推断
  → 扫描 3 个已有 pagedata.json → 提取实体/关系
  → 生成 app-blueprint.json（自动归类模块）
  → 用户确认模块划分

AI Phase-B: 补充上游配置
  → 生成 db-schema.json（从列定义反向推断）
  → 生成 permission-config.json（默认全权限）
  → 注册导航节点（按模块分组）
  → 无需重新生成现有页面配置

AI Phase-C: 开放式进化
  → 用户随时: "给 viewer 角色加权限控制" → 调整 permission-config
  → 用户随时: "加一个报表页" → 增量蓝图 + 生成新页面 + 注册导航
  → 每次扩展都基于已有配置增量操作，不破坏已稳定功能

完成 ✅ 单页面平滑升级为完整应用
```

---

## 五、与主流 AI 开发平台的深度对比

### 5.1 SPARK 独特优势（差异化定位）

| 对比维度 | v0.dev | Bolt.new | Copilot | **SPARK** |
|---------|--------|---------|---------|-----------|
| **输出物** | React 代码 | 全栈代码 | 补全代码 | **配置文件（零代码）** |
| **修改方式** | 重新生成代码 | 重新生成代码 | 光标处补全 | **修改 JSON + 热更新** |
| **运行时** | 需部署 | 需部署 | N/A | **配置即运行，秒级生效** |
| **回滚成本** | Git revert | Git revert | Ctrl+Z | **版本快照，一键回滚** |
| **非开发者** | ❌ 需懂代码 | ❌ 需懂代码 | ❌ 需懂代码 | **✅ 纯配置，业务人员可用** |
| **数据建模** | ❌ | ❌ | ❌ | **✅ DataSet 全配置化** |
| **权限系统** | ❌ | ❌ | ❌ | **✅ 配置驱动权限渲染** |
| **业务系统** | 仅前端 UI | 原型级 | 代码片段 | **✅ 面向企业级定制** |
| **渐进式** | 单页只能单页 | 单页只能单页 | 单文件补全 | **✅ 单页→模块→应用平滑扩展** |

### 5.2 SPARK 的核心竞争壁垒

```
代码生成平台（v0/Bolt/Copilot）         SPARK 配置生成平台
──────────────────────────            ──────────────────────────
AI → 生成代码                         AI → 生成配置
代码 → 编译部署                       配置 → 实时渲染
修改 = 重新生成/手改代码               修改 = 改 JSON
调试 = 查代码/查日志                   调试 = 查配置/AI 自动修
上线 = CI/CD 流水线                   上线 = 配置版本发布
回滚 = Git revert + 重新部署          回滚 = 配置版本切换
               ↓                                  ↓
    需要开发者参与全程                    业务人员可独立完成全流程
```

---

## 六、实施优先级与里程碑

### 6.1 执行总原则（先交付闭环，再扩能力）

1. **API-first 闸门**：每个里程碑先验证“能否复用现有 API”，不能复用才允许新增端点。
2. **最小可运行闭环优先**：先打通“生成→写入→导航→验证→回退”再叠加高级能力。
3. **每阶段都必须可回滚**：无回滚方案的能力不进入开发排期。

### 6.2 里程碑计划（Now / Next / Later）

| 阶段 | 时间窗 | 目标 | 关键交付 |
|------|--------|------|----------|
| **Now** | 1-2 周 | API-first 最小闭环 | 导航自动注册、配置验证器、批量写入稳定化 |
| **Next** | 2-6 周 | 多页面生成能力 | 蓝图、数据模型/权限模板化、多页面编排 |
| **Later** | 6 周+ | 企业级治理能力 | 变更工单化、版本治理、工作流/可视化 |

### 6.3 里程碑明细（含验收标准）

#### Now（1-2 周）

| 任务 | 涉及阶段 | 前置条件 | 验收标准 |
|------|---------|----------|----------|
| 导航自动注册（前端编排调用导航 API） | ⑦ | 已有页面批量写入成功 | 页面生成后 3 秒内导航可见；失败时有明确错误提示 |
| 配置验证器（跨文件一致性） | ⑨ | rule/pagedata/script 可读取 | 验证报告覆盖 dataKey/handler/render/component 四类错误 |
| API-first 编排闭环 | ③④⑤⑦⑨ | 可调用 `/api/ai/chat`、`__batch`、`navigation/nodes` | 单页面生成到可访问成功率 ≥ 95%（10 次样本） |

#### Next（2-6 周）

| 任务 | 涉及阶段 | 前置条件 | 验收标准 |
|------|---------|----------|----------|
| 应用蓝图生成（app-blueprint） | ① | 需求结构化输入可解析 | 蓝图可自动映射为模块与页面树 |
| 数据/权限模板化（db-schema/permission） | ②⑥ | 共享配置目录就绪 | 生成配置可直接被现有运行时消费，无手工补丁 |
| 多页面编排 | ⑧ | 蓝图可用 + 单页闭环稳定 | 一次请求可生成 ≥ 3 页且导航/路由一致 |

#### Later（6 周+）

| 任务 | 涉及阶段 | 前置条件 | 验收标准 |
|------|---------|----------|----------|
| 变更工单化执行 | ⑩ | 变更分析器 + 回滚快照可用 | 失败可按 CU 级别回滚，不影响已成功单元 |
| 版本治理（发布/回滚） | ⑨ | 版本元数据与快照目录就绪 | 版本发布可追踪、回滚可在分钟级完成 |
| 企业级扩展（可视化/工作流） | 新增 | 核心闭环长期稳定 | 不破坏现有 API-first 流程与数据兼容性 |

### 6.4 风险与回退策略

| 风险 | 触发信号 | 处理策略 | 回退动作 |
|------|---------|----------|----------|
| 导航注册失败 | 页面已生成但菜单未出现 | 自动重试 + 错误上报 | 保留页面，提示用户手动注册导航 |
| 配置不一致 | 验证器报错（dataKey/handler 缺失） | 阻断发布，进入 AI 自纠错 | 回退到上一个稳定快照 |
| 多页面部分失败 | N 页中部分写入失败 | 按 pageId 粒度重试与隔离 | 回滚失败页，保留成功页并标注状态 |
| 新增 API 引发复杂度上升 | 研发周期明显拉长 | 启动 API-first 审核（再次评估复用） | 暂停新增端点，退回复用方案 |

### 6.5 执行 Runbook（优化③）

#### 日常执行步骤（建议每次需求都走一遍）

1. 需求归类到 ①~⑩ 阶段（可多选）。
2. 先做 API 复用评审（通过则进入前端编排实现）。
3. 生成/修改配置并执行一致性验证。
4. 写入导航与路由，同步触发页面刷新。
5. 记录发布与回滚锚点（版本/快照/变更说明）。

#### 故障处理（15 分钟内）

| 时间窗 | 操作 |
|--------|------|
| 0-5 分钟 | 定位失败阶段（生成/写入/导航/渲染/验证）并冻结进一步写入 |
| 5-10 分钟 | 执行页级或版本级回滚，恢复可用状态 |
| 10-15 分钟 | 补充日志与复盘条目，决定是否进入 AI 自纠错重试 |

---

## 七、存储架构演进

### 7.1 DB + 文件系统双轨存储设计

当前后端已采用 H2 嵌入式数据库 + 文件系统双轨存储。新增配置类型遵循相同原则——**结构化元数据存 DB、大文本配置内容存文件系统**：

#### 现有存储清单

| 存储目标 | 介质 | Entity / 位置 | 说明 |
|---------|------|--------------|------|
| 页面配置元数据 | **H2 DB** | `PageConfigEntity` | pageId/title/icon/path/pageType/timestamps |
| 导航树 | **H2 DB** | `NavigationConfigEntity` | 整棵树 JSON 存 CLOB |
| 业务数据行 | **H2 DB** | `TableRowEntity` + `TableSchemaEntity` | GenericTableService 通用 CRUD |
| 租户/项目 | **H2 DB** | `TenantConfigEntity` + `ProjectEntity` | 租户隔离 |
| 用户 | **H2 DB** | `UserEntity` | 认证 |
| 页面配置文件 | **文件系统** | `data/pages-config/{t}/{p}/{pageId}/` | rule.json / pagedata.json / script.js / style.css |
| 组件元数据 | **文件系统** | `data/component-metadata.json` | 构建时生成 |

#### 新增存储设计

| 新增数据 | 介质 | 选型原因 | Entity / 位置 |
|---------|------|---------|--------------|
| **应用蓝图** | **H2 DB** | 需按 tenant/project 唯一约束 + 版本字段 + 频繁查询 | `BlueprintEntity`（CLOB 存 JSON） |
| **模块定义** | **H2 DB** | 与蓝图关联查询、列表展示、排序 | `ModuleEntity`（外键 → BlueprintEntity） |
| **变更请求** | **H2 DB** | 需按状态/时间查询历史、需事务保证原子性 | `ChangeRequestEntity`（CLOB 存分析 JSON） |
| **变更单元执行状态** | **H2 DB** | 每个 CU 独立状态跟踪（pending/running/success/failed/rolled-back） | `ChangeUnitEntity`（外键 → ChangeRequestEntity） |
| **版本快照元数据** | **H2 DB** | 版本列表查询、回滚时快速定位 | `VersionEntity`（version/publishedAt/changelog） |
| **db-schema / api-config / permission-config** | **文件系统** | 大 JSON 内容 + 需要 diff 可读性 + git-tracked | `data/pages-config/{t}/{p}/__shared/{moduleId}/` |
| **版本快照内容** | **文件系统** | 完整配置副本 + 需文件级 diff/回滚 | `data/pages-config/{t}/{p}/__versions/{version}/` |
| **变更前备份** | **文件系统** | 受影响文件备份 + 细粒度回滚恢复 | `data/pages-config/{t}/{p}/__changes/{CR-id}/` |
| **Prompt 模板** | **文件系统** | 纯文本 + 需 git-tracked + 运行时按阶段加载 | `data/prompts/layer-*.txt` |
| **页面模板** | **文件系统** | JSON 模板 + 需人工可读维护 | `data/templates/` |

#### 选型决策原则

| 决策维度 | 存 DB | 存文件 |
|---------|------|-------|
| 需要列表查询/过滤/排序 | ✅ | ❌ |
| 需要事务原子性（多步操作） | ✅ | ❌ |
| 需要唯一约束 / 外键关联 | ✅ | ❌ |
| 需要状态机跟踪 | ✅ | ❌ |
| 大文本 JSON（>10KB）且需 diff | ❌ | ✅ |
| 需要 git 版本跟踪 | ❌ | ✅ |
| 前端直接以文件路径读取 | ❌ | ✅ |
| 人工/AI 直接编辑内容 | ❌ | ✅ |

#### 新增 Entity 设计概览

```java
// ── BlueprintEntity ──
@Entity @Table(name = "app_blueprint")
class BlueprintEntity {
    Long id;
    String tenantId, projectId;      // 唯一约束
    @Lob String blueprintJson;       // app-blueprint.json 完整内容
    String version;                  // 语义版本号
    Instant createdAt, updatedAt;
}

// ── ChangeRequestEntity ──
@Entity @Table(name = "change_request")
class ChangeRequestEntity {
    Long id;
    String tenantId, projectId;
    String requestId;                // "CR-20260316-001"
    String description;              // 自然语言变更描述
    @Lob String analysisJson;        // change-request.json（AI 分析结果）
    @Lob String blueprintPatchJson;  // blueprint-patch.json
    String status;                   // analyzing | confirmed | executing | completed | failed | rolled-back
    String baseVersion;              // 变更基于的蓝图版本
    Instant createdAt, completedAt;
}

// ── ChangeUnitEntity ──
@Entity @Table(name = "change_unit")
class ChangeUnitEntity {
    Long id;
    Long changeRequestId;            // 外键
    String unitId;                   // "CU-1"
    String summary;
    int executionOrder;              // DAG 拓扑排序后的执行位置
    String status;                   // pending | running | success | failed | rolled-back
    @Lob String affectedFilesJson;   // 受影响文件列表
    String errorMessage;             // 失败原因
    Instant startedAt, completedAt;
}

// ── VersionEntity ──
@Entity @Table(name = "config_version")
class VersionEntity {
    Long id;
    String tenantId, projectId;
    String version;                  // "1.2.0"
    String changelog;
    String changeRequestId;          // 触发此版本的变更（可选）
    @Lob String manifestJson;        // version-manifest.json
    Instant publishedAt;
}
```

#### 数据库与文件的协作流程

```
变更请求进入
  ↓
DB: ChangeRequestEntity (status=analyzing)
  ↓ AI 分析完成
DB: ChangeRequestEntity (status=confirmed, analysisJson=...)
DB: ChangeUnitEntity × N (status=pending)
  ↓ 用户确认执行
文件: __changes/{CR-id}/pre-snapshot/     ← 变更前备份
DB: ChangeUnitEntity.CU-1 (status=running)
  ↓ AI 生成修改 → 写入 pages-config/{pageId}/
DB: ChangeUnitEntity.CU-1 (status=success)
  ↓ ... 逐 CU 执行 ...
DB: ChangeRequestEntity (status=completed)
  ↓ 验证通过 → 发布版本
文件: __versions/v1.3.0/snapshot/         ← 版本快照
DB: VersionEntity (version=1.3.0, changelog=自动生成)
```

### 7.2 文件系统目录结构

```
data/
├── pages-config/
│   └── {tenantId}/
│       └── {projectId}/
│           ├── __shared/                    ← 新增：模块级共享配置
│           │   ├── dictionaries.json        ← 字典定义
│           │   └── {moduleId}/
│           │       ├── db-schema.json       ← 数据库 Schema
│           │       ├── api-config.json      ← API 端点配置
│           │       └── permission-config.json← 权限矩阵
│           │
│           ├── {pageId}/                    ← 现有：页面级配置
│           │   ├── rule.json
│           │   ├── pagedata.json
│           │   ├── script.js
│           │   ├── style.css
│           │   ├── interactions.json        ← 新增：声明式交互
│           │   └── navigation-patch.json    ← 新增：导航节点
│           │
│           ├── __versions/                  ← 新增：版本快照内容
│           │   ├── v1.0.0/
│           │   │   └── snapshot/            ← 完整副本
│           │   └── v1.1.0/
│           │       └── snapshot/
│           │
│           └── __changes/                   ← 新增：变更文件备份
│               └── CR-20260316-001/
│                   └── pre-snapshot/         ← 变更前备份(受影响文件)
│
├── component-metadata.json                  ← 现有
├── templates/                               ← 新增：页面模板库
│   ├── list-page.template.json
│   ├── master-detail.template.json
│   ├── tree-table.template.json
│   ├── dashboard.template.json
│   ├── form-page.template.json
│   └── wizard.template.json
│
└── prompts/                                 ← 新增：分层 Prompt 存储
    ├── layer-0-base.txt                     ← 通用规则
    ├── layer-1-blueprint.txt                ← 蓝图层
    ├── layer-2-data-model.txt               ← 数据层
    ├── layer-3-api.txt                      ← API 层
    ├── layer-4-ui.txt                       ← UI 层（现有核心）
    ├── layer-5-behavior.txt                 ← 行为层
    ├── layer-6-permission.txt               ← 权限层
    ├── layer-7-validation.txt               ← 验证层
    └── layer-8-change-analysis.txt          ← 变更分析层
```

> **注意**：蓝图（app-blueprint.json）、变更请求（change-request.json）、版本清单（manifest.json）
> 等结构化元数据**不再存为独立文件**，而是作为 DB Entity 的 CLOB 字段持久化，
> 通过 REST API 读写。文件系统只存储**配置内容本体**和**快照/备份**。

---

## 八、核心设计原则

### 8.1 配置优先，代码兜底

```
需求 → AI 生成配置（90% 场景零代码）
         ↓ 配置无法表达？
       script.js 沙箱脚本（9% 场景极少代码）
         ↓ 沙箱无法满足？
       自定义组件 Spark.register()（1% 场景开发者介入）
```

### 8.2 渐进式开发

> 详细设计见 §2.2「渐进式开发：阶段独立性与多入口设计」

```
单页面 ────────→ 多页面 ────────→ 完整应用
(④⑤)            (①②③④⑤⑦)      (①②③④⑤⑥⑦⑧⑨⑩)
  │                │                │
  │ 每个阶段独立可用  │ 缺失阶段自动降级  │ 随时向上补全
  ↓                ↓                ↓
即时价值          渐进价值          完整价值
```

### 8.3 渐进式复杂度

```
Level 0: 纯配置（rule.json + pagedata.json）         → 业务人员
Level 1: 配置 + 声明式交互（interactions.json）       → 高级业务人员
Level 2: 配置 + 沙箱脚本（script.js）                 → 技术型业务人员
Level 3: 配置 + 自定义组件（Spark.register）          → 前端开发者
```

### 8.4 AI 闭环自治

```
生成 → 渲染 → 日志收集 → AI 分析 → 自动修复 → 再渲染 → ...
  ↑                                                    ↓
  └──────────── 人工介入（仅在 AI 无法自修复时）←──────────┘
```

### 8.5 安全与隔离

- **多租户隔离**：配置存储按 tenant/project 隔离
- **沙箱执行**：script.js 运行在 `with(__ctx)` 沙箱中，无法访问全局
- **权限驱动**：UI 渲染由后端 `_perm` 驱动，前端不做权限判定
- **版本回滚**：任何错误配置可一键回滚到已知良好版本

### 8.6 可观测与审计基线（优化④）

| 维度 | 最低要求 | 推荐实现 |
|------|----------|----------|
| 关联标识 | 每条日志含 `tenantId/projectId/pageId` | 再补 `requestId/changeRequestId` |
| 阶段事件 | 至少记录 ①~⑩ 中实际触发阶段 | 追加阶段耗时与失败分类 |
| 错误分级 | 区分 warning/error/fatal | 统一错误码与修复建议 |
| 审计追踪 | 记录“谁在何时改了什么配置” | 关联版本号与回滚记录 |

**建议指标**：
- 生成成功率、一次通过率、平均修复轮次、回滚频次、导航注册成功率。

---

## 九、总结

SPARK 已经建立了行业领先的**配置驱动 + AI 生成**架构基础，核心优势是：

1. **不生成代码，生成配置**——修改成本为零，实时生效
2. **两阶段生成 + 自动纠错**——质量保障闭环
3. **DataSet 统一数据层**——数据绑定全配置化
4. **组件元数据自动注入**——AI 拥有完整组件知识
5. **SSE 实时推送**——所见即所得开发体验

本方案在现有基础上扩展为完整的 **10 阶段全生命周期 AI 配置生成平台**，采用渐进式架构——每个阶段独立可用、缺失自动降级、随时可向上补全：

6. **需求变更闭环**——变更分析→增量策划→安全执行→回归验证，配置演进无需推倒重来
7. **渐进式开发**——单页面即时可用，随时向上补全蓝图/权限/导航，平滑成长为完整应用

与 v0.dev / Bolt.new / Copilot Workspace 等代码生成平台的本质区别在于：SPARK 的 AI 产出是**可热更新的配置**而非**需要编译部署的代码**，且采用渐进式架构——从一句话生成单页面开始，逐步扩展为完整业务系统，使业务人员可以独立完成从需求到上线的全流程，无需开发者介入。

### 9.1 30/60/90 行动清单（优化⑤）

| 周期 | 目标 | 可量化结果 |
|------|------|-----------|
| **30 天** | 打稳 API-first 最小闭环 | 单页面端到端成功率 ≥ 95%，导航注册自动化上线 |
| **60 天** | 打通模块级生成与共享配置 | 支持 ≥ 3 页面批量生成，跨页面一致性校验上线 |
| **90 天** | 建立变更治理与回滚常态化 | 变更有工单可追踪，回滚可在分钟级完成 |

> 执行建议：每 2 周复盘一次指标，未达标先补稳定性，再扩能力边界。
