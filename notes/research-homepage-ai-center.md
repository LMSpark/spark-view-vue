# 首页重写研读记录：企业 AI 中枢定位

## 任务目标

按“SPARK 是企业 AI 中枢，而不是 AI 编程工具”的定义重写公开首页。

## 已读文档与约束

- `docs/ai/AI_CODE_CHANGE_PROTOCOL.md`
- `docs/ai/ai-code-generation-behavior.md`
- `docs/ai/AI_MODEL_SPEC.md`
- `docs/ai/spark-ai-workflow.md`
- `knowledge/README.md`
- `knowledge/vue-frontend.md`
- `knowledge/monorepo-dependencies.md`
- `src/views/README.md`

核心约束：

- 修改代码前必须完成 7 阶段流程：研读复述、复杂度分级、逐题澄清、方案计划、用户审核、编码实施、知识沉淀。
- 未经方案审核通过，不得修改代码。
- `src/views/` 是路由级视图目录，`platform/` 放平台级公共页面：首页、登录、关于页。
- Vue 页面使用 Vue 3 Composition API、Element Plus 体系，图标通过现有 `NavIcon`/`@element-plus/icons-vue`。
- 不新增依赖，不修改 `pnpm-lock.yaml`。
- 不做顺手重构、批量格式化或计划外文件改动。

## 现有代码结构

### 首页文件

- `src/views/platform/HomePage.vue`
  - 职责：公开平台首页，展示系统介绍、功能亮点、Demo 和快速入口。
  - 形态：单文件 Vue 页面，包含 template、`script setup` 局部常量、scoped CSS。
  - 当前内容核心仍是“配置驱动系统 / 四文件 / 低维护 / Demo”。
  - 当前本地 `platformDemos` 只有 2 项，但页面文案写“三大 Demo”，存在现状不一致。
  - 使用 `NavIcon` 展示图标，不直接导入 Element Plus 图标。

### 路由注册链路

- `config/navigation/vue-pages.json`
  - `/` 注册为“平台首页”，`scope: public`，source 指向 `src/views/platform/HomePage.vue`。
- `src/registries/vue-page-registry.ts`
  - 从 `vue-pages.json` 解析 public/app/tenant 页面。
  - `buildComponentMap()` 加载 Vue system-page 组件。
  - `buildPreAuthNavTree()` 从 public 页面生成登录前导航树，`homePath` 为 `/`。
  - `getPublicPaths()` 提供未登录路由守卫 allowlist。
- `src/main.ts`
  - 启动阶段调用 `buildComponentMap()` / `buildPreAuthNavTree()` / `getPublicPaths()`。
  - `SparkApp.start()` 中把 `componentMap`、`preAuthNavTree`、`tenantPathPrefix` 传入 pageNode 配置。
  - 未登录时只允许 public path；普通已登录用户访问 `/` 会重定向到租户项目首页；平台管理员访问 `/` 或 `/login` 会重定向到 `/platform/dashboard`。

### 应用壳

- `src/App.vue`
  - 负责整体布局、导航、上下文 guard、router-view。
  - 首页不是登录页，会进入常规 AppLayout，但作为 public system-page 由预登录导航加载。

### 图标组件

- `src/components/NavIcon.vue`
  - 通过 `@element-plus/icons-vue` 动态匹配图标名。
  - 首页可继续沿用现有图标体系，不需要新增图标库。

### 测试影响

- `tests/config/vue-page-registry.test.ts`
  - 仅断言 `/` 对应 source 为 `src/views/platform/HomePage.vue`，不校验首页文案。
  - 若不改 `vue-pages.json`，该测试影响较小。

## 已运行基线验证

- `pnpm run typecheck`：通过。

## 初步影响范围判断

最小影响范围应为：

- `src/views/platform/HomePage.vue`

可能不需要修改：

- `config/navigation/vue-pages.json`
- `src/registries/vue-page-registry.ts`
- `src/main.ts`
- `src/App.vue`
- 测试文件

## 内容定位偏差

用户要求按新定义改写：首页要表达“企业 AI 中枢”，而不是继续表达“配置驱动代码/页面生成工具”。

新的主语应是企业业务人员、管理者、一线员工和企业数据流程，而不是程序员或代码生成。

核心叙事应从：

```text
需求 -> 配置 -> 页面/运行时
```

转向：

```text
人用文本/语音/图片/草图表达意图
-> SPARK AI 中枢理解业务
-> 调 DataSet / Workflow / API / 权限 / 页面配置 / 报表配置
-> 结构化校验、审计和治理
-> 直接改变企业数据和业务流程
```

## 风险与注意事项

- CTA 路由要符合 public 路由守卫；未登录可访问 `/login`、`/about` 和 public demo，不能把首屏主 CTA 指到普通用户未登录不可访问的租户页面。
- 若要强调“多模态直接操作企业数据”，首页文案不能再把 SPARK 降格成“页面配置生成器”。
- 若要保留 Demo 入口，需要处理当前“两个 Demo vs 三大 Demo”的不一致。
- 视觉重写会大量触碰 template/CSS，但应控制在单文件内，避免拆组件或新增资产，除非方案明确批准。
