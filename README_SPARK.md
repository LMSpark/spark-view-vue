# SPARK 组件架构 - EJ2 集成演示

## 🚀 项目概述

这是一个基于 Vue 3 + EJ2 的 SPARK 组件架构原型，实现了完全解耦的无限递归组件系统。通过能力提供者/消费者模式，实现了组件间的松耦合通信和无限层级的组件嵌套。

## ✨ 核心特性

### 1. 完全解耦的组件架构

- **能力提供者模式**: 组件通过提供能力接口实现功能共享
- **能力消费者模式**: 组件通过消费能力接口获取所需功能
- **上下文隔离**: 每个组件都有独立的上下文环境
- **无限递归**: 支持任意层级的组件嵌套

### 2. EJ2 组件深度集成
- **原生 EJ2 支持**: 完整支持 Syncfusion EJ2 组件库
- **类型安全**: 完整的 TypeScript 类型定义
- **配置驱动**: 通过 JSON 配置驱动组件行为
- **性能优化**: 基于 Vue 3 Composition API 的高效实现

### 3. 开发者友好
- **零配置启动**: 组件自动初始化和配置
- **热重载支持**: 开发时支持热重载
- **调试友好**: 详细的错误信息和调试信息
- **文档完善**: 完整的 API 文档和使用示例

## 📁 项目结构

```bash
apps/spark-view/
├── src/
│   ├── components/
│   │   └── spark/
│   │       ├── SparkComponentBase.vue      # SPARK 基础组件
│   │       └── ej2/
│   │           ├── SparkEJ2Grid.vue         # SPARK EJ2 网格组件
│   │           └── SparkEJ2Column.vue       # SPARK EJ2 列组件
│   ├── types/
│   │   └── spark-component.ts              # SPARK 类型定义
│   ├── views/
│   │   ├── SparkEJ2Demo.vue                # SPARK EJ2 演示页面
│   │   └── Home.vue                        # 主页
│   └── router/
│       └── index.ts                        # 路由配置
├── package.json
└── README.md
```

## 🛠️ 技术栈

- **Vue 3**: 使用 Composition API 和 `<script setup>` 语法
- **TypeScript**: 完整的类型安全支持
- **Vite**: 快速的构建工具和开发服务器
- **Syncfusion EJ2**: 企业级 UI 组件库
- **ESLint + Prettier**: 代码质量和格式化工具

## 🚀 快速开始

### 安装依赖

```bash
cd apps/spark-view
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:5173` 查看演示页面。

### 构建生产版本

```bash
npm run build
```

## 📖 使用指南

### 基本用法

```vue
<template>
  <SparkEJ2Grid :config="gridConfig" />
</template>

<script setup lang="ts">
import SparkEJ2Grid from '@/components/spark/ej2/SparkEJ2Grid.vue'
import type { SparkEJ2GridConfig } from '@root/types/spark-component'

const gridConfig: SparkEJ2GridConfig = {
  type: 'spark-ej2-grid',
  dataSource: [
    { id: 1, name: '张三', age: 25 },
    { id: 2, name: '李四', age: 30 }
  ],
  columns: [
    { type: 'spark-ej2-column', field: 'id', headerText: 'ID' },
    { type: 'spark-ej2-column', field: 'name', headerText: '姓名' },
    { type: 'spark-ej2-column', field: 'age', headerText: '年龄' }
  ]
}
</script>
```

### 嵌套列配置

```typescript
const nestedGridConfig: SparkEJ2GridConfig = {
  type: 'spark-ej2-grid',
  dataSource: [...],
  columns: [
    { type: 'spark-ej2-column', field: 'id', headerText: 'ID' },
    {
      type: 'spark-ej2-column',
      headerText: '个人信息',
      columns: [
        { type: 'spark-ej2-column', field: 'name', headerText: '姓名' },
        { type: 'spark-ej2-column', field: 'age', headerText: '年龄' }
      ]
    }
  ]
}
```

### 分页配置

```typescript
const pagingGridConfig: SparkEJ2GridConfig = {
  type: 'spark-ej2-grid',
  dataSource: [...],
  allowPaging: true,
  pageSettings: {
    pageSize: 10,
    pageSizes: [5, 10, 20, 50]
  },
  columns: [...]
}
```

## 🔧 架构设计

### SPARK 组件生命周期

1. **初始化**: 组件创建时自动注册能力提供者
2. **挂载**: 组件挂载时建立能力消费关系
3. **运行**: 组件通过能力接口进行通信
4. **销毁**: 组件销毁时自动清理能力关系

### 能力系统

- **网格能力**: 数据源管理、排序、过滤、分页等
- **列能力**: 列宽调整、显示隐藏、嵌套管理等
- **扩展能力**: 可通过插件系统扩展新能力

### 上下文管理

每个组件都有独立的上下文，包含：
- 组件配置
- 能力提供者集合
- 能力消费者集合
- 组件状态
- 父子关系

## 🎯 演示页面

访问以下页面查看不同功能的演示：

- **主页**: `http://localhost:5173/`
- **SPARK EJ2 演示**: `http://localhost:5173/spark-ej2-demo`
- **EJ2 原生演示**: `http://localhost:5173/ej2-native-demo`
- **类型安全演示**: `http://localhost:5173/type-safety`

## 📊 功能演示

### 1. 基础网格演示
展示基本的网格功能，包括数据绑定、列定义等。

### 2. 嵌套列演示
展示多级表头功能，支持无限层级的列嵌套。

### 3. 分页网格演示
展示分页功能，支持自定义页面大小和页面数量。

### 4. 配置结构展示
以标签页形式展示不同配置的 JSON 结构。

## 🔍 调试和开发

### 开发工具
- 使用 Vue DevTools 查看组件树和状态
- 使用浏览器开发者工具调试 EJ2 组件
- 查看控制台日志了解组件生命周期

### 常见问题
1. **组件不渲染**: 检查配置对象的 `type` 字段是否正确
2. **数据不显示**: 确认 `dataSource` 格式和列的 `field` 匹配
3. **样式问题**: 检查 CSS 作用域和 EJ2 主题配置

## 📚 API 参考

### SparkComponentConfig
所有 SPARK 组件的基础配置接口。

### SparkEJ2GridConfig
EJ2 网格组件的配置接口，继承自 SparkComponentConfig。

### SparkEJ2ColumnConfig
EJ2 列组件的配置接口，支持嵌套列定义。

## 🤝 贡献指南

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](../LICENSE) 文件了解详情。

## 🙏 致谢

- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Syncfusion EJ2](https://ej2.syncfusion.com/) - 企业级 UI 组件库
- [Vite](https://vitejs.dev/) - 下一代前端构建工具
- [TypeScript](https://www.typescriptlang.org/) - JavaScript 的超集

---

**注意**: 这是一个原型项目，用于探索和验证 SPARK 组件架构的可行性。在生产环境中使用前，请进行充分的测试和评估。