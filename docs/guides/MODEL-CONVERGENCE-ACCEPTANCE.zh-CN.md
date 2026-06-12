# 项目模型收敛 — 验收清单

> 对应 2026-06 减法：`domain-model` 删除、`planningStatus` 删除、`sub-page` → 嵌套 `page`（`hidden` + 无 `path`）。  
> 离线自动化：`pnpm run verify:model-convergence` · DB 迁移：`pnpm run migrate:navigation:sub-page`

## 1. 离线自动化（必过）

```bash
pnpm run verify:model-convergence
pnpm run typecheck
```

期望：Vitest 全绿；无 `ProjectRootModel` / `planningStatus` / 独立 `ConfigSubPageNode` 类型引用。

## 2. DB 批量迁移（有 MySQL 时）

脚本会依次尝试 **mysql CLI** → **docker compose exec mysql**（`spark-ai-server/docker-compose.yml`）。

```bash
# 审计 legacy 行（需 MySQL 或 Docker 中 mysql 容器运行中）
pnpm run migrate:navigation:sub-page -- audit

# 本地 dev 库一次性迁移（prod 走 Flyway V8 启动迁移）
pnpm run migrate:navigation:sub-page -- apply
```

期望：

- `audit` 最终输出 `OK: no legacy sub-page rows.`
- 迁移后 `NODE_KIND='page'`，`HIDDEN=1`，`PATH IS NULL`

Flyway：`spark-ai-server/src/main/resources/db/migration/V8__migrate_navigation_sub_page.sql`（`spring.flyway.enabled=true` 环境部署时自动执行）。

## 3. DevSystem — 嵌套子页

前置：`pnpm run dev`，打开 DevSystem，加载有 navigation 的项目。

| 步骤 | 操作 | 期望 |
|------|------|------|
| 3.1 | 选中某 **普通页面**，节点类别选 **子页面** | `nodeKind` 落为 `page`，`hidden=true`，无 `path` |
| 3.2 | 保存 navigation | 侧栏树不展示该子页；`findConfigPageByPageId` 仍可用 |
| 3.3 | 选中子页，编辑四文件 | `ConfigPageNode` 正常加载 rule/pagedata/script/style |
| 3.4 | 顶栏 | **无**「AI 策划」；选中配置页时有 **AI 编辑** |

## 4. pageDesign 门禁

| 步骤 | 操作 | 期望 |
|------|------|------|
| 4.1 | 页面 `effectiveDescription` 为空，DevSystem 点 **AI 编辑** | mutation 被 gate 拒绝（策划未定稿） |
| 4.2 | 填写 description / descriptionContext 后重试 | gate 通过，tool 可执行 |
| 4.3 | `implGate=closed` | pageDesign mutation 拒绝 |
| 4.4 | DevSystem **AI 闸门** 面板 | 仅 **implGate**、**upstreamContractsSatisfied**；无 planningStatus 下拉 |

离线覆盖：`pnpm run verify:page-design`。

## 5. projectPlanning（headless / Host Run）

| 步骤 | 操作 | 期望 |
|------|------|------|
| 5.1 | DevSystem 未选页时 | 无 projectPlanning 顶栏入口 |
| 5.2 | `pnpm run verify:project-planning` | Vitest 全绿 |
| 5.3 | Host Run provider 路径 | `project-planning-host-run-provider` 可 prepare + save navigation |

可选 SSE：`pnpm run verify:hr-sse-smoke-prereqs`（需 LLM key + 运行中后端）。

## 6. 运行态路由

| 步骤 | 操作 | 期望 |
|------|------|------|
| 6.1 | 嵌套子页 | `resolveNavNodeRuntimeTarget` → `{ kind: 'hidden', reason: 'sub-page' }` |
| 6.2 | 普通 page | 正常 SPA route |

离线覆盖：`packages/spark-app` 内 `runtime-target.test.ts`（已纳入 `verify:model-convergence`）。

## 7. Legacy 数据读入

| 步骤 | 操作 | 期望 |
|------|------|------|
| 7.1 | navigation JSON 仍含 `"nodeKind":"sub-page"` | TS `normalizeProjectNodeData` → `page` + `hidden` |
| 7.2 | Java `getNavConfig` | API 返回已 migrate 的树（`migrateLegacySubPagesInTree`） |
| 7.3 | Java `importNavConfig` / 保存 | DB 落库为 `page` + `hidden`，无 `sub-page` |

---

**签字：** 全部 1–7 通过后，模型收敛视为生产可接受。遗留 demo 页 `tree-demo/pagedata.json` 内 catalog 枚举可保留 `sub-page` 字样（演示节点类型表，非 navigation 真源）。

## 验收记录（2026-06-12）

| 章节 | 结果 | 说明 |
|------|------|------|
| §1 离线 | ✅ | `verify:model-convergence` 53/53 · `typecheck` · `verify:page-design` 32/32 · `verify:project-planning` 27/27 |
| §2 DB | ✅ | `migrate:navigation:sub-page audit` → `legacy sub-page rows: 0`（docker mysql） |
| §3–§4 DevSystem UI | ⚠️ | 代码已确认无 `AI 策划` / `planningStatus`；顶栏仅 `AI 编辑`。浏览器自动化需登录态，建议本地打开 `/dev` 点检 §3.1–3.4 |
| §5 projectPlanning | ✅ | 离线 27/27；DevSystem 无顶栏入口（源码检索） |
| §6 运行态 | ✅ | `runtime-target.test.ts` 纳入 `verify:model-convergence` |
| §7 Legacy | ✅ | TS normalize 测试 + Java `importNavConfig_migratesLegacySubPageToNestedPage` |
