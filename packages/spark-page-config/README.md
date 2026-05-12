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
- 提供设计时页面配置服务：页面四文件、导航节点、项目页面引用、页面配置变更事件

## 基本使用

```typescript
import { createConfigLoader } from '@spark-view/spark-page-config'

const loader = createConfigLoader({
  fileStorage: 'memory',
})

const pageConfig = await loader.loadPageConfig('homepage')
```

## 包内结构

```text
src/
  core/                   SparkNode 规范化、可编辑节点树、通用 JSON 文档编辑核心
  runtime/                业务脚本上下文类型契约
  types/                  页面四文件、加载器、ConfigLoadResult 等核心契约
  compiler/               rule/pagedata/script/style 的解析与编译
  files/                  页面配置文件写入与版本 API
  loader/                 页面四文件远程加载、缓存、缺失文件策略
  documents/              设计时 PageFileDocument、dirty、undo/redo、文本/模型同步
  page-design/            AI/设计器可复用的页面编辑 host 与操作服务
  services/
    index.ts              服务公共入口，对外通过 @spark-view/spark-page-config/services 消费
    page-config-events.ts 页面配置变更事件总线
    workspace-data/
      workspace-data-service.ts  页面配置、导航、项目数据服务聚合入口
      page-config-data-service.ts 页面四文件读写、版本、缓存服务
      navigation-data-service.ts  导航节点读写与链接探测服务
      project-data-service.ts     项目列表与跨项目导航读取服务
      types.ts                    服务入参与返回值契约
```

依赖方向只允许从上层编排模块指向包内核心模块，不能反向依赖 Vue、Vue Router、`spark-app` 或 `spark-component`。
应用侧若需要认证、租户路径、路由刷新、DOM 截图、AI 面板等能力，应在应用壳中注入给本包服务，而不是把这些框架能力放进本包。

## 相关文件

- `src/namespace.ts`：命名空间入口
- `src/runtime/script-context-types.ts`：脚本沙箱上下文类型
- `src/core/`：SparkNode、SparkNodeTree、JSON 文档编辑核心
- `src/services/`：框架无关的页面配置服务入口，通过 `@spark-view/spark-page-config/services` 消费
- `src/tests/`：配置加载与类型相关测试

## 与其他包的关系

- 依赖 [../spark-data/README.md](../spark-data/README.md) 提供的数据模型
- 依赖 [../spark-utils/README.md](../spark-utils/README.md) 提供的基础能力与工具
- 被 `spark-component` 和应用层页面渲染链消费
- 不依赖 Vue、Vue Router、`spark-app`、`spark-component`

## 开发命令

```bash
pnpm --filter @spark-view/spark-page-config run build
pnpm --filter @spark-view/spark-page-config run typecheck
pnpm --filter @spark-view/spark-page-config run test:run
```

## 进一步阅读

- [../../docs/guides/CONFIG_SYSTEM.md](../../docs/guides/CONFIG_SYSTEM.md)
- [../../docs/architecture/DATAFLOW_ARCHITECTURE.md](../../docs/architecture/DATAFLOW_ARCHITECTURE.md)
- [../../docs/ai/README.md](../../docs/ai/README.md)
