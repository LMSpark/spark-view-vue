# Monorepo 依赖与跨包影响传播

### 公共包修改的跨包传播

- **场景**：修改 `packages/` 下任一包的公共导出
- **规则**：必须先确认有哪些包依赖该包，影响范围必须包含所有消费方。`spark-utils` 被 `spark-ai`、`spark-component`、`spark-data`、`spark-project-model` 同时依赖，改 `spark-utils` 的公共 API 等于同时影响这四个包。
- **违反后果**：消费方编译失败或运行时 import 错误，但 `verify:rules` 不一定捕获（仅检查跨包相对导入和显式导出约束）

### 跨包相对导入禁止

- **场景**：在 `packages/spark-ai/` 中引用 `packages/spark-utils/` 的导出
- **规则**：所有跨包引用必须走 `@spark-appworks/spark-utils` 包名导入，禁止 `../../spark-utils/src/xxx` 形式的相对路径
- **违反后果**：`verify:deps` 检查会失败；即使通过，不同构建环境下行为不一致

### catalog 版本管理

- **场景**：新增或升级依赖版本
- **规则**：工作区基础依赖版本真源在 `pnpm-workspace.yaml` 的 `catalog:` 段。子包用 `"catalog:"` 引用，禁止在子包 `package.json` 中写死版本号。新增依赖时先判断应加在哪个包，再判断版本号是否应走 catalog。
- **违反后果**：版本碎片化导致不同包用不同版本的同名依赖，运行时出现难以排查的类型/行为不一致

### 公共导出变更的四同步

- **场景**：修改包的 `index.ts` 公共 barrel 导出
- **规则**：必须同步更新四项：package.json 的 `exports` 字段、`tsconfig.json` 的 `paths`、Vite/Vitest 的 alias、import smoke test
- **违反后果**：`verify:deps` 失败，或运行时某些导入路径无法解析

### 目录文件数硬限制

- **场景**：在已有目录下新增 `.ts` 或 `.vue` 文件
- **规则**：单个目录下 `.ts`/`.vue` 文件不得超过 10 个（不含 `index.ts`）；同一级子目录不得超过 7 个。超过必须按领域拆分。
- **违反后果**：`verify:ai-codegen` 不会自动检测此项（它是代码风格规则），但违反后代码定位困难、AI 和人类都难以导航

### verify:rules 的七项检查

- **场景**：需要知道验证失败是哪个子检查报的错
- **规则**：`pnpm run verify:rules` 包含七项检查：`verify:arch` + `verify:deps` + `verify:pages-config` + `verify:ai-codegen` + `verify:docs` + `verify:class-model` + `verify:ai-model`。可单独运行某项定位问题。
- **违反后果**：只知道 verify:rules 失败但不知道哪一项，排查效率低
