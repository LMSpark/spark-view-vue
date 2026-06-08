# @spark-appworks/vite-plugin-spark-catalog

VCM **native metadata** 生成工具：从 TypeScript 能力类提取 JSDoc + 类型，产出 `AiModuleMetadataJson` 与 runtime document，供 `VcmNativeAgentAdapter` 构建 LLM 知识体系。

## 命令

```bash
pnpm run generate:module-metadata    # 写入 runtime metadata 与 VCM catalog
pnpm run generate:component-catalog  # 写入组件 props catalog
pnpm run diagnose:module-metadata    # 仅诊断，不写文件
```

CLI 入口：`src/module-metadata-cli.ts`
默认读取根级 APP 配置协议文件：`config/ai/vcm.json`。

可选参数：

```bash
pnpm run generate:module-metadata -- --target page-design
pnpm run generate:module-metadata -- --config config/ai/vcm.json --target page-design
```

## 产出

| 文件 | 用途 |
|---|---|
| `page-design-module-metadata.generated.json` | VCM catalog 诊断 |
| `page-design-module-metadata.runtime.generated.json` | **`VcmNativeAgentAdapter` 消费** |
| `payload/component-catalog.json` | **Worker 按需消费的组件 props 知识** |

## VCM Registry 协议

`config/ai/vcm.json` 使用协议头声明格式，target 声明由 APP 配置层拥有：

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
        "vcmCatalog": "...generated.json",
        "runtime": "...runtime.generated.json",
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
