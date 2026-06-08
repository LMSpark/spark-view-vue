# VCM Generator 与 ClassModel 投影

> 状态：有效（2026-06）。Generator 仍产出 `AiModuleMetadataJson` 命名的 runtime document，但消费方已经切换为 VCM-native。

## 位置

```text
TS 业务类 + @moduleKind JSDoc
  -> APP 配置层 config/ai/vcm.json（VCM registry 协议）
  -> packages/vite-plugin-spark-catalog/src/module-metadata-generator.ts
  -> page-design-module-metadata.runtime.generated.json
  -> readModuleMetadataRuntimeDocument()
  -> resolveModuleMetadataJson()
  -> createClassModelDocumentFromRuntimeDocument()
  -> VcmNativeRuntime / VcmNativeAgentAdapter
```

`AiModuleMetadataJson` 是历史类型名，表示 VCM runtime metadata 文档，不代表旧 runtime 存在。

## Generator 当前职责

对 public class member 生成：

| 来源 | metadata 字段 |
|------|---------------|
| class JSDoc | `rootApi.jsdoc`、`kind`、`className` |
| public property | `attributes[]` |
| public method | `actions[]` |
| method params | `paramsSchema` |
| return type | `resultSchema`、`resultApis` |
| callback 首参 | 当前仍由 ClassModel 层识别为 `callback-param` child model |
| pooled schema | runtime document `$defs` |

生成 JSON 是大文件，不手改；需要变更时改 generator 或源 JSDoc 后重新生成。

## VCM Registry 协议

`config/ai/vcm.json` 是 APP 配置层的注册表，不属于 spark-ai 内核。它声明构建期要生成哪些 VCM native metadata target。

协议头：

```json
{
  "protocol": "spark-appworks.vcm.registry",
  "schemaVersion": 1
}
```

target 结构：

| 字段 | 说明 |
|------|------|
| `id` | target ID；CLI `--target` 使用 |
| `kind` | 当前固定为 `native-metadata` |
| `source.files` | TypeScript 源文件列表 |
| `roots[].className` | 作为 VCM rootApi 抽取的 class 名 |
| `roots[].kind` | 可选；用于人工核对 class 的 `@moduleKind` |
| `outputs.runtime` | VCM-native runtime metadata JSON |
| `outputs.jsdocTodoLog` | 源码 JSDoc / schema description 待补日志 |
| `outputs.componentCatalog` | 组件 props catalog JSON |

CLI 默认读取 `config/ai/vcm.json`，也可传 `--config <file>`。

## ClassModel 投影

`createClassModelDocumentFromRuntimeDocument()` 把 runtime metadata 转成 LLM 可消费模型：

```text
rootApi / apiRegistry
  -> ClassModelDocument.models
  -> renderModelGuide()
  -> renderAttributeGuide()
  -> renderMethodGuide()
```

Guide 输出是 d.ts-like 原生签名，不暴露 `resultApis`、`callbackApis` 等内部字段。

## callbackApis 方向

当前 `editNodeTree(run)`、`editDataSet(run)` 这类 callback 子模型已经在 ClassModel 里以 `callback-param` 边识别。后续 schemaVersion 迁移可以把它们从 result 语义中拆成显式 `callbackApis`。

目标：

```typescript
actions[].resultApis   // 仅返回值子模型
actions[].callbackApis // 仅 callback 参数子模型
```

验收重点：

- void action 不伪装成有返回链。
- callback 参数能继续投影到 `node-tree` / `dataset`。
- guide 文本仍是原生 TypeScript 形态。
- runtime JSON 继续使用 `$ref` / `apiRegistry` 去重。

## 关键文件

| 路径 | 职责 |
|------|------|
| `config/ai/vcm.json` | APP 配置层 VCM registry 协议文件 |
| `config/schemas/vcm.schema.json` | VCM registry JSON Schema |
| `packages/vite-plugin-spark-catalog/src/module-metadata-generator.ts` | TS / JSDoc -> runtime metadata |
| `packages/vite-plugin-spark-catalog/src/module-metadata-cli.ts` | 读取 VCM registry 并生成 metadata |
| `packages/vite-plugin-spark-catalog/src/vcm-config.ts` | VCM registry 协议解析 |
| `packages/spark-ai/src/vcm-native/metadata/ai-api-object-metadata-schema.ts` | metadata schema |
| `packages/spark-ai/src/vcm-native/metadata/resolve-api-object-metadata.ts` | `$ref` 解析 |
| `packages/spark-ai/src/vcm-native/class-model/from-runtime-metadata.ts` | runtime metadata -> ClassModel |
| `packages/spark-ai/src/vcm-native/projection` | guide 渲染 |
| `packages/spark-ai/src/agent/native-runtime/native-script-context.ts` | 脚本 API surface |

## 验证

```bash
pnpm exec vitest run packages/vite-plugin-spark-catalog/src/tests/module-metadata-generator.test.ts
pnpm exec vitest run packages/spark-ai/src/vcm-native/tests/class-model.test.ts
pnpm exec vitest run tests/page/page-design-knowledge.test.ts
```
