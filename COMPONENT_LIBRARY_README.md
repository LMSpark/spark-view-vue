# 构建时组件库生成与AI集成 - Mock实现

本文档描述了第十章"构建时组件库生成与AI集成"的Mock实现。

## 概述

在Vite构建过程中，自动生成Vue组件资源库，提取组件的属性配置信息，并模拟上传到服务端，为AI提供组件元数据的上下文。

## 实现内容

### 1. Vite插件 (`vite.config.ts`)

在构建时扫描组件目录，提取元数据：

```typescript
{
  name: 'generate-component-library',
  generateBundle(options, bundle) {
    // 扫描组件目录
    // 提取元数据 (vue-docgen-api + fallback mock)
    // 生成 component-library.json
    // 模拟上传到服务端
  }
}
```

### 2. 组件库工具 (`packages/spark-utils/src/tools/componentLibraryTool.ts`)

提供组件查询API：

- `getComponentInfo(componentName)` - 查询特定组件信息
- `searchComponents(keyword)` - 关键词搜索组件
- `getComponentRecommendations(scenario)` - 场景推荐组件

### 3. MCP工具定义

模拟MCP协议的工具：

- `get-component-info` - 组件信息查询
- `search-components` - 组件搜索
- `recommend-components` - 组件推荐

## 使用方法

### 1. 构建项目

```bash
pnpm run build
```

构建过程中会自动生成 `component-library.json` 文件。

### 2. 查看生成的组件库

```bash
node test-component-library.js
```

### 3. 在代码中使用

```typescript
import { getComponentInfo, searchComponents } from '@spark-view/spark-utils'

// 查询组件信息
const gridInfo = getComponentInfo('SparkEJ2Grid')

// 搜索组件
const results = searchComponents('grid')

// 获取推荐
const recommendations = getComponentRecommendations('显示数据表格')
```

## 生成的文件

### component-library.json

```json
{
  "SparkEJ2Grid": {
    "props": [
      {
        "name": "id",
        "type": "string",
        "description": "组件唯一标识"
      },
      {
        "name": "dataSource",
        "type": "Array",
        "description": "数据源"
      }
    ],
    "events": [
      {
        "name": "dataChanged",
        "description": "数据变化事件"
      }
    ],
    "slots": [
      {
        "name": "default",
        "description": "默认插槽"
      }
    ],
    "description": "Mock 元数据 for SparkEJ2Grid",
    "sourcePath": "features/spark/components/ej2/SparkEJ2Grid.vue",
    "isMock": true
  }
}
```

## 架构优势

1. **自动化**：构建时自动生成，无需手动维护
2. **类型安全**：基于TypeScript的静态分析
3. **可扩展**：支持自定义元数据提取逻辑
4. **AI友好**：为AI提供准确的组件边界信息

## 扩展方向

### 1. 真实元数据提取

替换mock逻辑，使用vue-docgen-api真实提取：

```typescript
import { parse } from 'vue-docgen-api'

const docs = await parse(filePath)
componentLibrary[componentName] = {
  props: docs.props || [],
  events: docs.events || [],
  slots: docs.slots || [],
  description: docs.description || ''
}
```

### 2. 服务端集成

替换mock上传，实现真实API调用：

```typescript
await axios.post('https://your-server.com/api/component-library', {
  data: componentLibrary
}, {
  headers: { 'Authorization': 'Bearer YOUR_API_KEY' }
})
```

### 3. MCP服务器集成

将工具集成到真实的MCP服务器中，提供给AI使用。

## 测试结果

```
🚀 测试组件库功能

📚 加载组件库成功: 3 个组件

🔍 模拟 getComponentInfo:
  SparkEJ2Grid: 2 props, 1 events, (Mock)

🔍 模拟 searchComponents:
  搜索 "Spark": 3 个结果

🔍 模拟 getComponentRecommendations:
  推荐 "显示数据表格": 1 个结果

✅ 组件库功能测试完成
```

## 下一步

1. 集成真实的vue-docgen-api进行元数据提取
2. 实现服务端API进行组件库存储
3. 将MCP工具集成到真实的AI开发环境中