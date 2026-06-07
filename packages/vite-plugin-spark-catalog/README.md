# @spark-appworks/vite-plugin-spark-catalog

VCM **module metadata** 生成工具：从 TypeScript 能力类提取 JSDoc + 类型，产出 `AiModuleMetadataJson` 与 runtime document，供 `AiModuleAdapter` 构建 LLM 知识体系。

## 命令

```bash
pnpm run generate:module-metadata    # 写入 page-design-module-metadata.*.generated.json
pnpm run diagnose:module-metadata    # 仅诊断，不写文件
```

CLI 入口：`src/module-metadata-cli.ts`

## 产出

| 文件 | 用途 |
|---|---|
| `page-design-module-metadata.generated.json` | VCM catalog 诊断 |
| `page-design-module-metadata.api.generated.json` | API / resultApis 诊断 |
| `page-design-module-metadata.runtime.generated.json` | **`AiModuleAdapter` 消费** |

## 源码扫描范围

默认由 `module-metadata-cli.ts` 配置，当前以 pageDesign 主链为准：

- `ProjectModel` / `ConfigPageNode`
- `DataSetCrudTool` / `SparkNodeTree`

## 测试

```bash
pnpm exec vitest run packages/vite-plugin-spark-catalog/src/tests/module-metadata-generator.test.ts
pnpm exec vitest run tests/page/page-design-knowledge.test.ts
```

## VCM 注释

组件/能力类 JSDoc 须满足 `@moduleAction`、`@moduleMutation` 等仓库约定；根级校验见 `pnpm run verify:vcm-comments`。
