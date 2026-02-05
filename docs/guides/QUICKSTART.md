# SPARK 快速开始

> 5 分钟上手 SPARK 框架

## 前置要求

- Node.js >= 18
- pnpm >= 8

## 安装

```bash
# 克隆项目
git clone https://github.com/your-org/spark-view.git
cd spark-view

# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev
```

访问 http://localhost:5173 查看效果。

## 核心概念

### 1. 组件注册

```typescript
import { Spark } from '@spark-view/spark-component'

// 注册组件
Spark.register({
  type: 'my-grid',
  name: 'My Grid',
  component: MyGridComponent
})

// 懒加载注册
Spark.register({
  type: 'my-chart',
  name: 'My Chart',
  loader: () => import('./MyChartComponent.vue')
})
```

### 2. 使用组件

```vue
<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'

const { provide, consume, whenAvailable } = useSparkComponent({
  type: 'my-grid'
})

// 提供能力
provide('dataSource', {
  getData: () => fetchData()
})

// 消费能力
const logger = consume('logger')
</script>
```

### 3. 数据管理

```typescript
import { SparkData } from '@spark-view/spark-data'

// 创建 DataSet
const dataSet = SparkData.createDataSet({
  dataSetName: 'MyData',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number' },
        { name: 'name', type: 'string' }
      ],
      rows: []
    }
  }
})

// 添加数据
dataSet.tables.Users.addRow({ id: 1, name: 'Alice' })

// 订阅变化
dataSet.subscribe('Users', (event) => {
  console.log('数据变化:', event)
})
```

### 4. 页面渲染

```vue
<template>
  <PageRenderer :config="pageConfig" />
</template>

<script setup lang="ts">
import { PageRenderer } from '@spark-view/spark-renderer'

const pageConfig = {
  pageId: 'home',
  layout: {
    type: 'container',
    children: [
      { type: 'spark-ej2-grid', id: 'userGrid' }
    ]
  },
  dataSet: {
    tables: {
      Users: { columns: [...], rows: [...] }
    }
  }
}
</script>
```

## 项目结构

```
spark-view/
├── packages/
│   ├── spark-app/          # 应用基础设施
│   ├── spark-component/    # 组件系统
│   ├── spark-data/         # 数据管理
│   ├── spark-page-config/  # 页面配置
│   ├── spark-renderer/     # 页面渲染
│   └── spark-utils/        # 工具函数
├── features/
│   └── spark/              # SPARK 组件实现
├── docs/                   # 文档
└── tests/                  # 测试
```

## 常用命令

```bash
# 开发
pnpm run dev              # 启动开发服务器
pnpm run build            # 构建生产版本

# 质量
pnpm run lint             # 代码检查
pnpm run typecheck        # 类型检查
pnpm run test             # 运行测试

# 包管理
pnpm -F <包名> run build  # 构建单个包
pnpm -F <包名> run test   # 测试单个包
```

## 下一步

- [组件开发指南](COMPONENT_DEVELOPMENT.md) - 创建自定义组件
- [数据管理指南](DATA_MANAGEMENT.md) - DataSet 和 TreeManager
- [能力系统指南](CAPABILITY_PROVISION.md) - 组件间通信
- [API 参考手册](API_REFERENCE.md) - 完整 API 文档

## 常见问题

### 1. 端口冲突

如果 5173 端口被占用，修改 `vite.config.ts`：

```typescript
export default defineConfig({
  server: {
    port: 3000  // 使用其他端口
  }
})
```

### 2. 找不到模块

检查 `tsconfig.json` 中的路径别名配置：

```json
{
  "compilerOptions": {
    "paths": {
      "@spark-view/*": ["./packages/*/src"]
    }
  }
}
```

### 3. 组件未注册

确保在 `main.ts` 中调用了组件注册：

```typescript
import { registerCustomComponents } from './components'

registerCustomComponents()
```

## 获取帮助

- 📖 查看 [文档中心](../README.md)
- 🐛 报告 [GitHub Issues](https://github.com/your-org/spark-view/issues)
- 💬 参与 [讨论](https://github.com/your-org/spark-view/discussions)
