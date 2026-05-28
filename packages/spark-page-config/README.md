# @spark-view/spark-page-config

SPARK 的页面模型层，负责把导航属性、rule.json、pagedata.json、script.js 和 style.css 聚合成 `PageModel`，并对接当前的数据模型与脚本沙箱。

## 当前定位

- `PageModel` / `PageModelFactory` 是运行态和渲染态唯一公开入口
- `PageEditor` 是编辑态唯一聚合入口，内部管理已打开的 `PageModel`
- loader、compiler、file-api 只作为包内部依赖，不从公共入口暴露

## 当前主路径

项目现行模式以后端托管页面配置为主，页面文件实际存储在：

```text
spark-ai-server/data/pages-config/
```

前端通过作用域化页面配置 API 读取这些文件，而不是继续把 `public/pages-config/` 当作默认入口。

## 典型职责

- 通过 `PageModel.load()` 读取页面四文件并保持 timestamp/notModified 缓存协议
- 通过 `PageModel.toRenderConfig()` 投影渲染器所需的内存态配置
- 暴露脚本沙箱所需的类型定义与上下文契约
- 管理页面级缓存清理和刷新

## 基本使用

```typescript
import { createPageModelFactory } from '@spark-view/spark-page-config'

const pageModels = createPageModelFactory({
  fileStorage: 'memory',
})

const pageModel = pageModels.create('homepage')
await pageModel.load()
const renderConfig = pageModel.toRenderConfig()
```

## 公开入口

- 根入口 `@spark-view/spark-page-config`：`PageModel`、`PageModelFactory`、`createPageModelFactory` 和少量独立公共能力
- `editor`：`createPageEditor` / `PageEditor` 唯一编辑聚合入口，覆盖导航、四文件、节点树、数据集、生命周期、版本和预览配置构建
- `ai`：pageDesign / leave-request 等 AI 业务注册入口，供 App 服务层注册到 `AI_AGENT_HOST`
- `json-document`：通用 JSON tree editor 模型、mutation、flat roundtrip、schema helpers

应用层、渲染层、DevSystem 和 AI 都不得直接创建或调用 loader / compiler / file-api。运行态统一使用 `PageModelFactory`，编辑态统一使用 `createPageEditor`，AI 接入只使用 `@spark-view/spark-page-config/ai` 的注册 API。

## 相关文件

- `src/config/`：内部四文件加载、缓存、编译与加载契约
- `src/editor/page-model.ts`：PageModel 聚合模型
- `src/navigation/`：导航 DTO、归一化、编辑会话与 API client
- `src/json-document/`：通用 JSON 文档树能力
- `src/design/`：页面文件生命周期、设计期 artifacts 和 AI 编辑服务
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

