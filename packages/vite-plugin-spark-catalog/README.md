# @spark-view/vite-plugin-spark-catalog

构建期使用的 Vite 插件工作区，用来从组件源码提取结构化元数据，并生成 AI 运行时和提示词所需的目录产物。

## 负责内容

- 基于 VCM 的组件 props 元数据提取
- 结构化组件目录生成
- 扁平文本目录兼容转换
- 构建期提示词拼装输入整理

## 使用定位

- 这是内部工作区包，不是业务页面直接依赖的运行时模块。
- 当组件 API、提示词目录或组件元数据生成逻辑需要调整时，优先从这里入手。

## CLI 环境变量

通过 `packages/vite-plugin-spark-catalog/src/cli.ts` 执行目录生成时，可用以下环境变量覆盖默认行为：

- `SPARK_CATALOG_INCLUDE_GLOBAL_PROPS`：`true/false`，是否保留 VCM 全局 props
- `SPARK_CATALOG_VCM_RAW_TYPE`：`true/false`，透传 VCM `rawType`
- `SPARK_CATALOG_VCM_SCHEMA`：`true/false`，透传 VCM `schema`
- `SPARK_CATALOG_VCM_NO_DECLARATIONS`：`true/false`，透传 VCM `noDeclarations`

未设置时保持现有默认值。

## 相关位置

- `src/index.ts`：插件主入口
- `src/json-catalog-generator.ts`：结构化目录生成
- `src/prompt-generator.ts`：提示词目录文本生成

## 相关文档

- [../../docs/ai/architecture/AI_METADATA_PIPELINE.md](../../docs/ai/architecture/AI_METADATA_PIPELINE.md)