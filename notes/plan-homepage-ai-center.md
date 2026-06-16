# 首页重写方案：企业 AI 中枢定位

## 任务目标

将公开首页从“配置驱动页面生成/低代码工具”改写为“企业从界面时代进入意图时代，SPARK 作为企业 AI 中枢让业务意图直达数据、流程、权限和决策”的战略叙事页。

## 影响范围

- `src/views/platform/HomePage.vue`
  - 重写首页 template 文案和区块结构。
  - 重写本页局部数据常量，替换当前 `platformDemos` 的低代码 Demo 叙事。
  - 重写 scoped CSS，使视觉转向克制高端企业科技：深色首屏、冷白正文、少量电光蓝/青色、治理感和基础设施感。

不修改：

- `config/navigation/vue-pages.json`
- `src/registries/vue-page-registry.ts`
- `src/main.ts`
- `src/App.vue`
- `pnpm-lock.yaml`
- 任何包级公共 API、依赖、路由注册协议或测试文件

## 技术方案

1. 保持 `HomePage.vue` 单文件实现，不拆新组件，不新增依赖。
2. 保留 `NavIcon` 作为图标入口，使用现有 Element Plus 图标名。
3. 首页结构调整为战略叙事页：
   - Hero：主张“从界面时代进入意图时代”，副文案强调业务意图直达数据、流程、权限和决策。
   - 时代变化：从“人找菜单、点页面、搬数据”到“人表达意图、AI 调度系统、业务直接生效”。
   - 中枢能力：DataSet、Workflow、API、权限、报表、页面配置围绕 AI 中枢连接。
   - 治理闭环：语义理解、前置条件、schema 校验、权限审计、执行追踪、回滚/复盘。
   - 角色价值：CEO、CIO、伙伴/平台视角。
   - CTA：进入平台、预约演示或登录注册入口。
   - 底部最后一排短标签统一为 4 个汉字，避免长短不齐削弱高级感。
4. CTA 路径保持 public-safe：
   - “进入平台”优先指向 `/login` 或 `/demo/custom-r-table` 中已 public 的路径，避免未登录用户进入 tenant/app 路由被守卫重定向。
   - “预约演示”如无现有页面，先用 `/login` 注册 tab 或 `mailto:` 不引入新页面。
5. CSS 重写时控制在本页 scoped 样式内：
   - 避免装饰性 orbs/bokeh。
   - 避免紫蓝低代码模板感。
   - 避免卡片堆叠和嵌套卡片。
   - 保证移动端文字不溢出，首屏能看到下一节提示。

## 关键设计决策

- 不做竞品对比：按用户选择，只讲 SPARK 自己的世界观，不出现 TRAE、Copilot、Cursor、v0 等名字。
- 不把 SPARK 定义成“代码生成工具”：编程只是能力之一，首页主语是企业运行、数据、流程、权限和决策。
- 面向决策者、CIO、投资人/合作伙伴：语言保留战略高度、治理可信度和平台想象力，不写成一线操作说明书。
- 不改路由配置：当前 `/` 已是 public 首页，改文案和视觉即可达成目标，避免扩大影响面。

## 兼容性

- public 路由、登录前导航树、路由守卫行为不变。
- `tests/config/vue-page-registry.test.ts` 仍应通过，因为首页 source/path 不变。
- 不新增依赖，不改 lockfile，不影响 monorepo 包导出。
- 只改公开首页视觉与文案，不改变业务页、租户页和平台管理页运行逻辑。

## 验证计划

- 改动前基线：`pnpm run typecheck` 已通过。
- 最小验证：
  - 首次改完 `HomePage.vue` 后运行 `pnpm run typecheck`。
- 完整本次验证：
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm exec vitest run tests/config/vue-page-registry.test.ts`
- 浏览器验证：
  - 启动 `pnpm run dev`。
  - 用 Browser 打开 `/`。
  - 检查桌面首屏、滚动区块、移动端宽度。
  - 检查 CTA 可点击且未登录路径行为合理。

## 风险项

- 首页当前是 1561 行单文件，重写范围大；需避免同时做无关重构。
- 文案“高级感/韵味”主观性强；先按已确认的方向实施，若视觉或表达不对，下一轮只调首页文案和 CSS。
- 现有 AppLayout 会包住首页，首页自身首屏需要适配应用壳高度和预登录导航。
- 如预约演示没有现成页面，不能新增页面入口；本次只选择现有可达路径或邮件链接。
