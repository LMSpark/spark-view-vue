# SPARK 项目文档

> 更新日期：2026-02-04

## 📦 核心包

### 应用层 (L1)
- **[spark-app](../packages/spark-app/README.md)** - 应用基础设施层
  - 应用上下文、日志、错误处理、路由守卫
  - 认证授权、Bootstrap 流程

### 页面配置层 (L2)  
- **[spark-page-config](../packages/spark-page-config/README.md)** - 页面配置加载
  - 本地/远程配置加载
  - 动态路由注册

### 渲染层 (L3)
- **[spark-renderer](../packages/spark-renderer/README.md)** - 页面渲染引擎
  - PageRenderer 组件
  - CSS 作用域、脚本沙箱、DataSet 管理

### 数据层
- **[spark-data](../packages/spark-data/README.md)** - 数据空间
  - DataSet (表管理、关系管理、级联操作)
  - TreeManager (树形数据管理)
  - FilterParser (表达式解析)

### 组件层
- **[spark-component](../packages/spark-component/README.md)** - SPARK 组件系统
  - 组件注册、能力系统、依赖注入

### 工具层
- **[spark-utils](../packages/spark-utils/README.md)** - 通用工具函数

## 📖 快速开始

### 1. 应用初始化

```typescript
import { SparkApp } from '@spark-view/spark-app'

// 使用声明式 API 启动应用
await SparkApp.start({
  app: {
    el: '#app',
    router
  },
  auth: {
    enabled: true,
    loginPath: '/login'
  },
  pageConfig: {
    loader: configLoader
  },
  spark: {
    manager,
    registry
  }
})
```

### 2. 页面渲染

```vue
<template>
  <PageRenderer :config-loader="configLoader" />
</template>

<script setup>
import { PageRenderer } from '@spark-view/spark-renderer'
import { configLoader } from '@/config'
</script>
```

### 3. 数据管理

```javascript
// 页面脚本中使用 DataSet
function __init__() {
  const dataSet = $dataSet  // 沙箱注入
  const users = dataSet.getTable('Users')
  
  // 监听数据变化
  dataSet.on('data:changed', ({ tableName, row }) => {
    console.log('数据变更:', tableName, row)
  })
}
```

## 🏗️ 架构说明

```
┌─────────────────────────────────────────┐
│  应用层 (L1) - spark-app                │
│  ├─ 认证授权、路由守卫                   │
│  └─ 日志、错误处理、应用上下文            │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  配置层 (L2) - spark-page-config         │
│  ├─ 配置加载 (本地/远程)                 │
│  └─ 动态路由注册                         │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  渲染层 (L3) - spark-renderer            │
│  ├─ PageRenderer 组件                    │
│  ├─ CSS 作用域、脚本沙箱                 │
│  └─ DataSet 自动初始化                   │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  数据层 - spark-data                     │
│  ├─ DataSet (表、关系、级联)             │
│  ├─ TreeManager (树形数据)               │
│  └─ FilterParser (表达式解析)            │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  组件层 - spark-component                │
│  └─ SPARK 组件系统 (注册、能力、DI)      │
└─────────────────────────────────────────┘
```

## 📚 开发指南

- **[业务脚本开发](./guides/BUSINESS_SCRIPTS.md)** - 页面脚本编写规范
- **[数据管理指南](./guides/DATA_MANAGEMENT.md)** - DataSet 使用指南
- **[组件开发指南](./guides/COMPONENT_DEVELOPMENT.md)** - SPARK 组件开发

## 🔧 API 文档

- [spark-app API](../packages/spark-app/README.md)
- [spark-renderer API](../packages/spark-renderer/API.md)
- [spark-data API](../packages/spark-data/README.md)
- [spark-component API](../packages/spark-component/API.md)

## 🗂️ 归档文档

历史文档已移至 [_archive](./_archive/) 目录。
