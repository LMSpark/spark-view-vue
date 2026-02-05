# @spark-view/spark

> SPARK 统一命名空间 - 整合所有子包的统一 API 入口

## 安装

```bash
pnpm add @spark-view/spark
```

## 使用方式

### 方式 1：使用统一命名空间（推荐）

```typescript
import { SPARK } from '@spark-view/spark'

// === 应用启动 ===
SPARK.App.start({
  rootComponent: App,
  plugins: [/* ... */]
})

// === 组件注册 ===
SPARK.Component.register({
  name: 'MyButton',
  path: './MyButton.vue',
  lazy: true
})

// === 数据管理 ===
const dataSet = SPARK.Data.createDataSet({
  dataSetName: 'Users',
  tables: { /* ... */ }
})

// === 组件开发 ===
const { provide, consume } = SPARK.Component.useSpark(config)
```

### 方式 2：使用快捷 API

```typescript
import { SPARK } from '@spark-view/spark'

// 常用功能的快捷方式
app.use(SPARK.install)
SPARK.register({ name: 'MyButton', path: './MyButton.vue' })
const ds = SPARK.createDataSet({ /* ... */ })
const { provide, consume } = SPARK.useSpark(config)
```

### 方式 3：按需导入子系统

```typescript
import { SparkComponent, SparkData, SparkApp } from '@spark-view/spark'

// 只使用需要的子系统
app.use(SparkComponent.install)
const ds = SparkData.createDataSet({ /* ... */ })
SparkApp.start({ /* ... */ })
```

## API 结构

```typescript
SPARK {
  // 子系统命名空间
  Component: {
    install()           // 安装插件
    register()          // 注册组件
    registerAll()       // 批量注册
    useSpark()          // 组件中使用 SPARK
    capabilities()      // 能力管理器
    presets            // 预设配置
    // ... 更多 API
  }
  
  Data: {
    createDataSet()     // 创建数据集
    createTreeManager() // 创建树管理器
    createBindingContext() // 创建绑定上下文
    // ... 更多 API
  }
  
  App: {
    start()            // 启动应用
    createRouter()     // 创建路由
    // ... 更多 API
  }
  
  Logger              // 日志系统
  
  // 快捷 API
  install()           // = Component.install
  register()          // = Component.register
  useSpark()          // = Component.useSpark
  createDataSet()     // = Data.createDataSet
  createTreeManager() // = Data.createTreeManager
  start()             // = App.start
  
  // 工具
  version            // 版本号
  getVersions()      // 获取所有子系统版本
}
```

## 优势

✅ **统一入口**：一个导入解决所有需求  
✅ **命名空间隔离**：避免命名冲突  
✅ **类型完善**：完整的 TypeScript 支持  
✅ **按需加载**：支持按需导入子系统  
✅ **向后兼容**：保留各子包独立导出  

## 完整示例

```typescript
import { createApp } from 'vue'
import { SPARK } from '@spark-view/spark'
import App from './App.vue'

const app = createApp(App)

// 1. 安装 SPARK 插件
app.use(SPARK.install)

// 2. 注册组件
SPARK.register({
  name: 'UserList',
  path: './components/UserList.vue',
  lazy: true
})

// 3. 创建数据集
const userDataSet = SPARK.createDataSet({
  dataSetName: 'Users',
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

// 4. 启动应用
app.mount('#app')
```

## 子包说明

- **@spark-view/spark-component** - 组件系统（注册、能力、动态加载）
- **@spark-view/spark-data** - 数据管理（DataSet、Tree、Binding）
- **@spark-view/spark-app** - 应用框架（启动、路由、生命周期）
- **@spark-view/spark-utils** - 工具库（Logger、事件系统等）
- **@spark-view/spark-page-config** - 页面配置系统
- **@spark-view/spark-renderer** - 渲染引擎

## License

MIT
