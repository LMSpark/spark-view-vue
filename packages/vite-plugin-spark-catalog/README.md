# @spark-appworks/vite-plugin-spark-catalog

VCM **native metadata** 生成工具：从 TypeScript 能力类提取 JSDoc + 类型，产出 `AiModuleMetadataJson` 与 runtime document，供 `VcmNativeAgentAdapter` 构建 LLM 知识体系。

## 命令

```bash
pnpm run generate:vcm-metadata       # 写入全部 VCM 能力面 metadata
pnpm run generate:module-metadata    # 默认写入 project-page-surface
pnpm run generate:component-catalog  # 写入 generated/vcm/component-catalog.json
pnpm run diagnose:module-metadata    # 仅诊断，不写文件
```

CLI 入口：`src/module-metadata-cli.ts`
默认读取根级 VCM 配置协议文件：`config/vcm/registry.json`。

可选参数：

```bash
pnpm run generate:module-metadata -- --target project-model
pnpm run generate:module-metadata -- --target project-page-surface
```

## 产出

| 文件 | 用途 |
|---|---|
| `generated/vcm/<surface-id>/*.runtime.generated.json` | **VCM 能力面知识制品** |
| `generated/vcm/<surface-id>/*.jsdoc-todo.generated.json` | 源码 JSDoc / schema description 待补日志 |
| `generated/vcm/component-catalog.json` | **pageDesign Worker 按需消费的组件 props** |

## VCM Registry 协议

`config/vcm/registry.json` 使用协议头声明格式，target 声明由 VCM 配置层拥有：

```json
{
  "protocol": "spark-appworks.vcm.registry",
  "schemaVersion": 1,
  "metadataTargets": [
    {
      "id": "page-design",
      "kind": "native-metadata",
      "source": { "files": ["..."] },
      "roots": [{ "className": "ProjectModel", "kind": "project" }],
      "outputs": {
        "runtime": "...runtime.generated.json",
        "jsdocTodoLog": "...jsdoc-todo.generated.json",
        "componentCatalog": "payload/component-catalog.json"
      }
    }
  ]
}
```

Schema 文件：`config/schemas/vcm.schema.json`。

## 测试

```bash
pnpm exec vitest run packages/vite-plugin-spark-catalog/src/tests/module-metadata-generator.test.ts
pnpm exec vitest run tests/page/page-design-knowledge.test.ts
```

## VCM 注释

能力类 JSDoc 须满足 `@moduleAction`、`@moduleMutation` 等仓库约定；当前 module metadata 生成器只读取 TypeScript 能力类，不读取 Vue 组件标签。
