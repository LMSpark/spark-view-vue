# @spark-view/spark-page-config

SPARK 的页面配置加载层，负责把页面文件、脚本和样式组织成统一的页面配置对象，并对接当前的数据模型与脚本沙箱。

## 当前定位

- 页面配置的读取、缓存和装配入口
- `rule.json`、`pagedata.json`、`script.js`、`style.css` 的统一加载层
- 配置校验、脚本上下文类型与页面配置编译边界

## 当前主路径

项目现行模式以后端托管页面配置为主，页面文件实际存储在：

```text
spark-ai-server/data/pages-config/
```

前端通过作用域化页面配置 API 读取这些文件，而不是继续把 `public/pages-config/` 当作默认入口。

## 典型职责

- 读取页面结构配置并返回统一页面对象
- 解析页面数据配置，编译为 DataSet 入口数据
- 暴露脚本沙箱所需的类型定义与上下文契约
- 管理页面配置缓存和刷新

## 基本使用

```typescript
import { createConfigLoader } from '@spark-view/spark-page-config'

const loader = createConfigLoader({
  fileStorage: 'memory',
})

const pageConfig = await loader.loadPageConfig('homepage')
```

## 公开入口

- 根入口 `@spark-view/spark-page-config`：最小运行时 config loader / compiler API
- `editor`：`PageEditor` 唯一编辑聚合入口，覆盖导航、四文件、节点树、数据集、生命周期、版本和预览配置构建
- `ai`：pageDesign / leave-request 等 AI 业务注册入口，供 App 服务层注册到 `AI_AGENT_HOST`
- `json-document`：通用 JSON tree editor 模型、mutation、flat roundtrip、schema helpers

DevSystem 和编辑态调用方统一使用 `@spark-view/spark-page-config/editor`；AI 接入只使用 `@spark-view/spark-page-config/ai` 的注册 API。不要直接依赖内部 design / navigation / node-tree / runtime 子域。

## 相关文件

- `src/config/`：四文件加载、缓存、编译与加载契约
- `src/node-tree/`：SparkNode 与 SparkNodeTree 编辑模型
- `src/navigation/`：导航 DTO、归一化、编辑会话与 API client
- `src/runtime/`：脚本上下文和运行时服务 capability
- `src/json-document/`：通用 JSON 文档树能力
- `src/design/`：页面文件编辑、设计期文档、工作区、生命周期与 artifacts
- `src/ai/`：智能编排相关业务注册
- `tests/`：配置加载、文档、节点树、AI 注册和公共入口测试

## 与其他包的关系

- 依赖 [../spark-data/README.md](../spark-data/README.md) 提供的数据模型
- 依赖 [../spark-utils/README.md](../spark-utils/README.md) 提供的基础能力与工具
- 被 `spark-component` 和应用层页面渲染链消费

## 开发命令

```bash
pnpm --filter @spark-view/spark-page-config run build
pnpm --filter @spark-view/spark-page-config run typecheck
pnpm --filter @spark-view/spark-page-config run test:run
```

## 进一步阅读

- [../../docs/guides/CONFIG_SYSTEM.md](../../docs/guides/CONFIG_SYSTEM.md)
- [../../docs/architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md](../../docs/architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md)
- [../../docs/architecture/DATAFLOW_ARCHITECTURE.md](../../docs/architecture/DATAFLOW_ARCHITECTURE.md)
- [../../docs/ai/spark-ai-complete-guide.md](../../docs/ai/spark-ai-complete-guide.md)

