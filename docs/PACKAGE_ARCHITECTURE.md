# SPARK 包架构总结

## 📦 包结构概览

```
├── packages/                  # 📦 核心包（可复用）
│   ├── spark-core/           # SPARK 组件系统
│   └── spark-data/           # SPARK 数据空间
│
├── pages-config/             # 📄 页面配置（与 src 平级）
│   ├── routes.json           # 路由配置
│   └── {pageId}/             # 各页面配置
│       ├── rule.json         # UI 规则
│       ├── pagedata.json     # 数据配置
│       ├── script.js         # 业务逻辑
│       └── style.css         # 样式
│
├── src/                      # 源代码
│   ├── views/                # 页面视图
│   ├── api/                  # API 接口
│   ├── utils/                # 工具函数
│   └── components/           # 通用组件
│
├── features/                 # 功能特性模块
├── tests/                    # 单元测试
└── docs/                     # 文档
```

---

## 🎯 设计原则

### 1. 命名空间优先

**spark-core 使用 `Spark` 命名空间：**
```typescript
import { Spark } from '@spark-view/spark-core'

// 统一入口
const manager = Spark.createComponentManager()
const registry = Spark.createComponentRegistry()
app.use(Spark.createVuePlugin({ manager, registry }))
```

**spark-data 使用 `SparkData` 命名空间：**
```typescript
import { SparkData } from '@spark-view/spark-data'

// 统一入口
const dataSet = SparkData.createDataSet({ ... })
const treeManager = SparkData.createTreeManager({ ... })
const context = SparkData.createContext('Users')
```

### 2. 职责分离

| 包 | 职责 | 核心概念 |
|----|------|---------|
| **spark-core** | 组件生命周期、能力系统、插件 | Manager, Registry, Capability, Plugin |
| **spark-data** | 数据管理、树结构、绑定上下文 | DataSet, TreeManager, BindingContext |

### 3. 向后兼容

两个包都保留直接导入类的方式：

```typescript
// 旧方式（仍然支持）
import { DataSetManager, TreeManager } from '@spark-view/spark-data'
const ds = DataSetManager.create({ ... })
const tree = new TreeManager({ ... })

// 新方式（推荐）
import { SparkData } from '@spark-view/spark-data'
const ds = SparkData.createDataSet({ ... })
const tree = SparkData.createTreeManager({ ... })
```

---

## 📚 API 对比

### spark-core API

```typescript
import { Spark } from '@spark-view/spark-core'

// 创建管理器
Spark.createComponentManager()
Spark.createComponentRegistry()

// 注册组件
Spark.register(config)
Spark.registerLogical(config)

// 获取单例
Spark.manager()
Spark.registry()
Spark.capabilities()

// Vue 插件
Spark.createVuePlugin({ manager, registry })
```

### spark-data API

```typescript
import { SparkData } from '@spark-view/spark-data'

// 创建数据对象
SparkData.createDataSet(config, dataLoader?)
SparkData.fromJSON(json, dataLoader?)

// 创建树管理器
SparkData.createTreeManager(config, nodes?, context?)
SparkData.treeFromJSON(json, context?)

// 创建绑定上下文
SparkData.createContext(table, contextId?, dataSet?)

// 工具方法
SparkData.createFilterParser()

// 高级访问
SparkData.classes.DataSet
SparkData.classes.TreeManager
```

---

## 🔧 配置说明

### tsconfig.json 路径别名

```json
{
  "compilerOptions": {
    "paths": {
      "@spark-view/spark-core": ["./packages/spark-core/src/index.ts"],
      "@spark-view/spark-data": ["./packages/spark-data/src/index.ts"]
    }
  }
}
```

### vite.config.ts 别名

```typescript
export default defineConfig({
  resolve: {
    alias: {
      '@spark-view/spark-core': path.resolve(__dirname, 'packages/spark-core/src'),
      '@spark-view/spark-data': path.resolve(__dirname, 'packages/spark-data/src')
    }
  }
})
```

---

## 📖 使用示例

### 完整应用示例

```typescript
// main.ts
import { createApp } from 'vue'
import { Spark } from '@spark-view/spark-core'
import { SparkData } from '@spark-view/spark-data'
import App from './App.vue'

const app = createApp(App)

// 1. 初始化 SPARK 组件系统
const manager = Spark.createComponentManager()
const registry = Spark.createComponentRegistry()
app.use(Spark.createVuePlugin({ manager, registry }))

// 2. 注册应用组件
Spark.register({
  type: 'my-grid',
  name: 'My Grid',
  component: MyGridComponent,
  providers: [{ name: 'data-provider', ... }]
})

// 3. 创建数据空间
const dataSet = SparkData.createDataSet({
  dataSetName: 'AppData',
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
}, async (tableName) => {
  const res = await fetch(`/api/${tableName}`)
  return res.json()
})

// 4. 提供全局数据
app.provide('appDataSet', dataSet)

app.mount('#app')
```

### 组件内使用

```typescript
// MyComponent.vue
<script setup lang="ts">
import { inject } from 'vue'
import { useSparkComponent } from '@spark-view/spark-core'
import { SparkData } from '@spark-view/spark-data'
import type { DataSet } from '@spark-view/spark-data'

// 使用 SPARK 组件系统
const { context, provide, consume } = useSparkComponent({
  type: 'my-component',
  name: 'My Component'
})

// 使用数据空间
const dataSet = inject<DataSet>('appDataSet')
const context = SparkData.createContext('Users', 'default', dataSet)

// 创建树管理器
const treeManager = SparkData.createTreeManager({
  idField: 'id',
  parentIdField: 'parentId'
})
</script>
```

---

## ✅ 验证清单

- [x] ✅ 类型检查通过（vue-tsc）
- [x] ✅ 所有测试通过（31+ tests）
- [x] ✅ 命名空间 API 可用
- [x] ✅ 向后兼容保留
- [x] ✅ API 文档完整
- [x] ✅ 示例代码清晰
- [x] ✅ 路径别名配置正确

---

## 📝 迁移指南

### 从旧代码迁移到命名空间 API

**Before (旧方式):**
```typescript
import { DataSetManager, TreeManager } from '@/models/dataSet'
import { BindingContext } from '@/models/bindingContext'

const dataSet = DataSetManager.create({ ... })
const tree = new TreeManager({ ... })
const context = new BindingContext('Users')
```

**After (新方式):**
```typescript
import { SparkData } from '@spark-view/spark-data'

const dataSet = SparkData.createDataSet({ ... })
const tree = SparkData.createTreeManager({ ... })
const context = SparkData.createContext('Users')
```

---

## 🎯 最佳实践

1. **优先使用命名空间 API**
   - ✅ `SparkData.createDataSet()`
   - ❌ `DataSetManager.create()`

2. **保持包职责清晰**
   - spark-core：组件系统
   - spark-data：数据管理

3. **利用 TypeScript 类型**
   ```typescript
   import type { IDataSet, DataRow } from '@spark-view/spark-data'
   ```

4. **使用工厂方法而非构造器**
   - ✅ `SparkData.createTreeManager()`
   - ❌ `new TreeManager()`

---

## 📚 相关文档

- [spark-core API 文档](./packages/spark-core/API.md)
- [spark-data API 文档](./packages/spark-data/API.md)
- [SPARK 架构设计](./docs/SPARK_ARCHITECTURE.md)
- [Copilot 指令](./.github/copilot-instructions.md)
