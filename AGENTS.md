# SPARK AppWorks — Codex 代理说明

## 环境设置

**必需运行时：**
- Node >= 20（用 `node --version` 验证）
- pnpm >= 10（缺失时执行 `npm install -g pnpm@10`）
- 只有 Java 后端任务（`spark-ai-server/`）需要 JDK 17+。纯前端工作跳过。

**安装依赖（仅前端，适合大多数任务）：**
```bash
pnpm install --frozen-lockfile
```

**除非明确需要，否则不要运行：**
- `pnpm run dev` — 启动全栈（Java + Vite），启动较慢
- `cd spark-ai-server && mvn install` — 下载 Maven 依赖，非常慢
- `pnpm run build` — 包含 Java 的完整流水线，除非测试构建，否则避免运行

**开发重启约定：**
- 修改 `spark-ai-server/`（Java、`application*.yml`、Flyway 等）后，**必须重启** `pnpm run dev`（或单独重启 8180 上的 Spring Boot）；后端无 HMR。
- 仅改前端包/`src/` 时，Vite 热更新即可；不必为纯前端改动重启 Java。

**验证命令（较快，变更后运行）：**
```bash
pnpm run typecheck   # TypeScript 严格检查
pnpm run lint        # ESLint
pnpm run test        # Vitest 单元测试
```

## 仓库地图

```
packages/
├── spark-utils/        # 纯 TS 基础能力：capability key、logger、HTTP
├── spark-data/         # DataSet、DataTable、DataView、TreeManager、data-view-key
├── spark-project-model/  # 页面配置解析、脚本上下文、配置加载
├── spark-component/    # Vue 渲染器、组件注册表、能力接线
├── spark-app/          # 应用壳、路由、认证、插件、启动引导
├── spark-ai/           # VCM-native AI 运行时：7 工具闭集、Host/ToolLoop、SSE 传输（见 packages/spark-ai/ARCHITECTURE.md）
├── vite-plugin-spark-catalog/ # VCM module metadata 生成
└── vxe-table/          # VXE Table 集成
spark-ai-server/        # Spring Boot 后端（Java）— 非 Java 任务跳过
src/                    # 应用入口、视图、启动引导
tests/                  # 根级 Vitest 测试
```

**包依赖顺序（严格、无环）：**
`spark-utils` ← `spark-data` ← `spark-project-model` ← `spark-component` ← `spark-app`

## 关键入口

- `packages/spark-component/src/core/useSparkComponent.ts` — 组件 hook
- `packages/spark-component/src/page/usePageDataSet.ts` — 页面数据接线
- `packages/spark-component/src/page/binding/bindRules.ts` — 规则绑定
- `packages/spark-data/src/core/data-view-key.ts` — DataViewKey/DataMember 绑定格式
- `packages/spark-utils/src/capability.ts` — capability Symbol key
- `spark-ai-server/data/pages-config/` — 运行中页面配置（真源）

## 不可协商规则

1. **包边界严格。** 跨包绝不要使用相对导入，只使用 `@spark-appworks/*` 包名。
2. **`spark-utils`、`spark-data`、`spark-project-model` 必须保持框架无关。** 这些包里不要导入 `vue`、`vue-router` 或 `element-plus`。
3. **Capability DI ≠ Vue DI。** 业务能力使用 `sparkProvide` / `sparkConsume`。Vue `provide/inject` 只用于基础设施。
4. **DataSet 管线单向：** `pagedata.json` → `parsePageData()` → `DataSet` → `usePageDataSet()` → `PAGE_DATASET` → `dataViewKey + dataMember + dataField` → `DataView` → UI. 不要用 `pageData` 或 `$data` 旁路绕开。
5. **绝不要在 `clearDataSet()` 中调用 `DataSet.destroy()`。** DataSet 实例会跨导航缓存复用。
6. **配置优先。** 优先使用 `rule.json`、`pagedata.json` 和现有渲染器能力。只有配置无法表达行为时才使用 `script.js`。
7. **Fail-fast。** 不要添加掩盖缺失 API、无效配置或状态不一致的静默回退。
8. **Commit scope 仅限于：** `deps`, `docs`, `scripts`, `spark-data`, `spark-app`, `spark-ai`, `spark-component`, `spark-utils`, `spark-project-model`.

## AI 代码生成行为准则

Codex 生成或修改代码时，必须遵守 `docs/ai/ai-code-generation-behavior.md`。

核心方向：
- 不要默认用 `interface` 搞一切。
- 优先按“接口契约 -> class 基础/默认实现 -> 具体 class -> 必要子类”的层次组织代码。
- 只有稳定契约、跨模块能力、DTO/config/payload 或多个实现共享协议才使用 `interface`。
- 如果只有一个实现，默认使用具体 class 或普通函数，不机械创建 `XxxInterface` / `XxxImpl`。
- 泛型、工具类型和公共导出必须收敛；新增抽象前必须有真实重复、稳定扩展点或跨模块契约。
- 函数/方法签名必须短：默认最多 3 个位置参数；4 个及以上改成具名 options/command 对象。
- 参数类型不要内联大对象或深层泛型；提取具名 type/class，让签名读起来像业务动作而不是类型展览。
- 参数列表里不要写 JSDoc；说明放到 options type、class 字段或函数上方。
- 注释只解释契约、约束、优先级和风险；VCM/LLM 可见语义必须在首次声明处用自然语言夹注释 + 结构化 tag 标注。

## DataViewKey 绑定格式

- `dataViewKey`: DataView 定位键, `table@viewId` or `#scope@table@viewId`
- `dataMember`: DataView 成员枚举字符串，例如 `rows`, `currentRow`, `aggregateResult`
- `dataField`: 可选的对象型成员字段路径，例如 `customer.name`
- 不要使用旧的成员拼接键或点号数据路径

## 脚本沙箱（`script.js`）

允许的全局变量： `$page`, `$route`, `$dataSet`, `$query`, `SparkData`, `h`

禁止： `$data`, ESM `import`, `window.xxx` globals, direct `ElMessage` / `ElMessageBox`, direct Vue Router imports

## 大文件 — 不要直接修改

这些目录文件很大，不应直接编辑：
- `src/services/page-design/page-design-module-metadata.runtime.generated.json`

## Commit Message 格式

```
<type>(<scope>): <description>
```

示例：
- `feat(spark-data): add computed column API`
- `fix(spark-component): resolve DataViewKey race`
- `refactor(spark-ai): split session orchestrator`
