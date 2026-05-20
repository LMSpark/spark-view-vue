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
import { createConfigLoader } from '@spark-view/spark-page-config/page/loading'

const loader = createConfigLoader({
  fileStorage: 'memory',
})

const pageConfig = await loader.loadPageConfig('homepage')
```

## 相关文件

- `src/page/namespace.ts`：页面配置命名空间入口
- `src/page/loading/`：四文件加载、缓存与编译
- `src/page/workspace/`：页面文件编辑、设计期文档与生命周期
- `src/page/sandbox/`：脚本沙箱上下文类型
- `src/assistant/`：智能编排相关业务注册
- `src/tests/`：配置加载与类型相关测试

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
- [../../docs/architecture/DATAFLOW_ARCHITECTURE.md](../../docs/architecture/DATAFLOW_ARCHITECTURE.md)
- [../../docs/ai/SPARK_AI_PACKAGE_USAGE_GUIDE.md](../../docs/ai/SPARK_AI_PACKAGE_USAGE_GUIDE.md)
