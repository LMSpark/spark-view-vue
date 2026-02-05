# @spark-view/spark-renderer

> SPARK 页面渲染引擎 - 将配置化页面渲染为 Vue 组件

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.4-green.svg)](https://vuejs.org/)

## 特性

-  **配置化渲染** - 将 PageConfig 渲染为 Vue 组件
-  **DataSet 集成** - 页面级数据管理和主从表联动
-  **CSS 隔离** - 自动添加作用域前缀
-  **脚本沙箱** - 安全执行页面脚本
-  **双向绑定** - 自动绑定数据和事件
-  **插槽支持** - 自定义 loading、error、content 插槽

## 架构定位

\\\
独立底层包:
  - spark-app (基础设施)
  - spark-data (数据管理)
  - spark-page-config (配置加载)

集成包:
  - spark-renderer (页面渲染)  本包
     spark-data
     spark-page-config
     spark-app
\\\

**职责**:
- 渲染引擎：配置  Vue 组件
- DataSet 管理：页面级数据隔离
- CSS 隔离：样式作用域
- 脚本沙箱：安全执行脚本
- 数据绑定：Rule 绑定处理

## 安装

\\\ash
pnpm add @spark-view/spark-renderer
\\\

## 快速开始

### 1. 渲染页面

\\\ue
<template>
  <PageRenderer :config=&quot;pageConfig&quot; />
</template>

<script setup lang=&quot;ts&quot;>
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
\\\

### 2. DataSet 集成

\\\	ypescript
import { SparkData } from '@spark-view/spark-data'

// 创建 DataSet
const dataSet = SparkData.createDataSet({
  dataSetName: 'PageData',
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

// 在配置中使用
const pageConfig = {
  dataSet,
  layout: { ... }
}
\\\

### 3. CSS 隔离

\\\	ypescript
// 配置中的样式自动添加作用域
const pageConfig = {
  pageId: 'home',
  styles: {
    '.title': { color: 'blue' },
    '.button': { fontSize: '14px' }
  }
}

// 渲染后自动添加前缀
// .page-home .title { color: blue; }
// .page-home .button { font-size: 14px; }
\\\

### 4. 脚本沙箱

\\\	ypescript
const pageConfig = {
  pageId: 'home',
  script: {
    onMounted: function() {
      // 在沙箱中执行
      this.dataSet.tables.Users.addRow({ id: 1, name: 'Alice' })
    }
  }
}
\\\

## 核心组件

### PageRenderer

主渲染组件

\\\ue
<PageRenderer
  :config=&quot;config&quot;
  @error=&quot;handleError&quot;
  @load=&quot;handleLoad&quot;
>
  <template #loading>
    <div>加载中...</div>
  </template>
  <template #error=&quot;{ error }&quot;>
    <div>错误: {{ error.message }}</div>
  </template>
</PageRenderer>
\\\

**Props**:
- \config\: 页面配置对象
- \dataSet\: 可选的外部 DataSet

**Events**:
- \@load\: 页面加载完成
- \@error\: 渲染错误

**Slots**:
- \loading\: 加载插槽
- \error\: 错误插槽
- \content\: 内容插槽

## API 文档

完整 API 文档请查看 [API.md](./API.md)

## 依赖

\\\json
{
  &quot;@spark-view/spark-app&quot;: &quot;workspace:*&quot;,
  &quot;@spark-view/spark-data&quot;: &quot;workspace:*&quot;,
  &quot;@spark-view/spark-page-config&quot;: &quot;workspace:*&quot;,
  &quot;vue&quot;: &quot;^3.4.0&quot;
}
\\\

## 开发命令

\\\ash
pnpm run typecheck   # 类型检查
pnpm run test        # 运行测试
pnpm run build       # 构建包
\\\

## License

MIT