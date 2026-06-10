# @spark-appworks/vite-plugin-spark-catalog

VCM **native metadata** 生成工具：从 TypeScript 能力类提取 JSDoc + 类型，产出 runtime document 与 dist bundle，供 `VcmNativeAgentAdapter` / Worker 构建 LLM 知识体系。

## 命令

```bash
pnpm run generate:vcm-metadata       # 写入 registry 内全部 metadata target
pnpm run generate:module-metadata    # 默认 target project-page-surface
pnpm run generate:component-catalog  # 写入 generated/vcm/component-catalog.json
pnpm run diagnose:module-metadata    # 仅诊断，不写文件
pnpm run verify:vcm-native           # 生成 + audit + 单测门禁
```

CLI 入口：`src/module-metadata-cli.ts`
默认配置：`config/vcm/registry.json`。

可选参数：

```bash
pnpm run generate:module-metadata -- --target project-model
pnpm run generate:module-metadata -- --target project-page-surface
```

## 产出（`generated/vcm/<target-id>/`）

| 文件 | 用途 |
|---|---|
| `manifest.json` + `kinds/*.json` + `$defs.json` | Worker 按需加载的 VCM bundle |
| `*-module-metadata.runtime.generated.json` | 组装 monolithic runtime（dev/审计） |
| `*-module-metadata.runtime.ts` | 业务层 static import 入口 |
| `*-module-metadata.jsdoc-todo.generated.json` | 源码 JSDoc / schema 待补日志 |
| `vcm-compile-report.json` | 编译门禁真源（`gates.*`） |
| `generated/vcm/component-catalog.json` | 组件 props（registry 根级 `componentCatalogOutput`） |

## VCM Registry 协议

`config/vcm/registry.json`（`spark-appworks.vcm.registry`）声明 metadata target；不承载 AI business alias。

```json
{
  "protocol": "spark-appworks.vcm.registry",
  "schemaVersion": 1,
  "componentCatalogOutput": "generated/vcm/component-catalog.json",
  "metadataTargets": [
    {
      "id": "project-page-surface",
      "kind": "native-metadata",
      "source": { "files": ["packages/spark-project-model/src/project/project-model.ts"] },
      "roots": [{ "className": "ProjectModel", "kind": "project" }],
      "outputs": {
        "distDir": "generated/vcm/project-page-surface",
        "runtime": "generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime.generated.json",
        "jsdocTodoLog": "generated/vcm/project-page-surface/project-page-surface-module-metadata.jsdoc-todo.generated.json"
      }
    }
  ]
}
```

Schema：`config/schemas/vcm.schema.json`。规范：`docs/ai/VCM_NATIVE_CLASS_SPEC.md`。

## 测试

```bash
pnpm run verify:vcm-native
pnpm exec vitest run packages/vite-plugin-spark-catalog/src/tests/module-metadata-generator.test.ts
```

## VCM 注释

能力类 JSDoc 须满足 `@moduleKind`、`@moduleAction`、`@moduleMutation` 等仓库约定；生成器只读取 TypeScript 能力类，不读取 Vue 组件标签。
