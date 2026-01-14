# 项目文件结构规范

> 版本：2.0  
> 日期：2026-01-11  
> 状态：已实施

## 目录结构

```
src/
├── models/                    # 领域模型（camelCase 命名）
│   ├── bindingContext.ts      # 视图层（BindingContext 类）
│   ├── dataTable.ts           # 结构层（DataTable 类）
│   ├── dataSet.ts             # 领域层（DataSet 类）
│   └── dataSetManager.ts      # 工厂层（DataSetManager 类）
│
├── utils/                     # 工具函数和辅助类
│   ├── parsers/               # 🆕 解析器模块
│   │   └── filterExpressionParser.ts  # 过滤表达式解析
│   ├── managers/              # 🆕 管理器模块
│   │   └── treeManager.ts     # 树形数据管理
│   └── page-helpers/          # 页面辅助函数（ES6 模块）
│       ├── common.js          # 通用上下文访问
│       ├── datasetHelper.js   # DataSet 辅助函数
│       └── treeHelper.js      # 树形工具函数
│
├── types/                     # 类型定义
│   ├── index.ts               # 通用类型
│   └── pageData.ts            # PageData 架构类型
│
├── views/                     # Vue 组件
│   └── DynamicPage.vue        # 动态页面渲染核心
│
├── pages-config/              # 页面配置（低代码）
│   └── {pageId}/
│       ├── rule.json          # UI 结构配置
│       ├── pagedata.json      # 页面数据
│       ├── script.js          # 业务逻辑（可选）
│       └── style.css          # 样式（可选）
│
├── router/                    # 路由配置
│   └── index.ts
│
├── api/                       # API 接口
│   └── index.ts
│
├── mock/                      # Mock 数据
│   └── ...
│
├── app.ts                     # SSR 应用工厂
├── entry-client.ts            # 客户端入口
├── entry-server.ts            # 服务端入口
└── main.ts                    # SPA 入口（开发用）
```

## 命名规范

### 1. Models 目录
- **规则**：使用 **camelCase**（驼峰命名）
- **原因**：模型类文件名与类名保持一致性
- **示例**：
  - ✅ `bindingContext.ts` → `class BindingContext`
  - ✅ `dataTable.ts` → `class DataTable`
  - ✅ `dataSet.ts` → `class DataSet`
  - ❌ ~~`BindingContext.ts`~~ (PascalCase 不推荐)

### 2. Utils 目录
- **parsers/** - 解析器类
  - 负责：数据转换、表达式解析
  - 示例：`filterExpressionParser.ts`
  
- **managers/** - 管理器类
  - 负责：复杂业务逻辑、状态管理
  - 示例：`treeManager.ts`
  
- **page-helpers/** - 页面辅助函数
  - 格式：ES6 模块（.js 文件）
  - 用途：页面脚本中使用的全局上下文访问

### 3. Types 目录
- **index.ts** - 通用类型定义
- **pageData.ts** - PageData 架构类型（1500+ 行）

### 4. Pages-Config 目录
- **规则**：使用 **kebab-case**（短横线命名）
- **示例**：
  - ✅ `tree-demo/`
  - ✅ `master-detail/`
  - ✅ `dataset-demo/`

## 导入路径规范

### 绝对路径（推荐）
使用 `@/` 别名引用 src 目录：

```typescript
// 模型
import { BindingContext } from '@/models/bindingContext'
import { DataSet } from '@/models/dataSet'
import { FilterExpressionParser } from '@/models/filterExpressionParser'
import { TreeManager } from '@/models/treeManager'

// 类型
import type { DataRow, IDataTable } from '@/types/pageData'

// 页面辅助
import { $dataSet, $data } from '@/utils/page-helpers/common.js'
```

### 相对路径
仅在同级或父级目录中使用：

```typescript
// 在 models/dataSet.ts 中
import { DataTable } from './dataTable'
import { BindingContext } from './bindingContext'

// 在 utils/managers/treeManager.ts 中
import type { BindingContext } from '../../models/bindingContext'
import type { TreeConfig } from '../../types/pageData'
```

## 架构层次对应

```
领域模型层 (models/)
  ├── Factory:   dataSetManager.ts  → 静态工厂方法
  ├── Domain:    dataSet.ts         → 业务逻辑、事件系统
  ├── Structure: dataTable.ts       → 表结构、上下文管理
  └── View:      bindingContext.ts  → 数据视图、过滤排序

工具层 (utils/)
  ├── Parsers:   parsers/           → 表达式解析、数据转换
  ├── Managers:  managers/          → 树形管理、复杂逻辑
  └── Helpers:   page-helpers/      → 页面脚本辅助函数
```

## 最佳实践

### ✅ DO
1. **统一命名风格**：models 使用 camelCase
2. **分类清晰**：parsers、managers、helpers 分开
3. **使用绝对路径**：跨目录导入使用 `@/` 别名
4. **类型安全**：所有工具类使用 TypeScript

### ❌ DON'T
1. **混合命名风格**：避免同目录中 PascalCase 和 camelCase 混用
2. **深层相对路径**：避免 `../../../` 多层相对路径
3. **工具类混杂**：解析器、管理器、辅助函数应分类存放
4. **循环依赖**：使用类型前向声明避免循环引用

## 迁移指南

### 从旧结构迁移
如果你的代码中有以下导入：

```typescript
// ❌ 旧路径
import { BindingContext } from '@/models/BindingContext'
import { DataTable } from '@/models/DataTable'
import { FilterExpressionParser } from '@/utils/filterExpressionParser'
import { TreeManager } from '@/utils/treeManager'

// ✅ 新路径
import { BindingContext } from '@/models/bindingContext'
import { DataTable } from '@/models/dataTable'
import { FilterExpressionParser } from '@/models/filterExpressionParser'
import { TreeManager } from '@/models/treeManager'
```

### 批量替换命令（PowerShell）
```powershell
# 查找所有需要更新的文件
Get-ChildItem -Recurse -Filter "*.ts","*.js" | 
  Select-String -Pattern "from.*BindingContext|from.*DataTable|from.*filterExpressionParser|from.*treeManager"
```

## 版本历史

### v2.0 (2026-01-11)
- ✅ 规范 models 文件命名为 camelCase
- ✅ 创建 utils/parsers/ 和 utils/managers/ 子目录
- ✅ 移动 filterExpressionParser.ts 到 parsers/
- ✅ 移动 treeManager.ts 到 managers/
- ✅ 更新所有导入路径（11 个文件）

### v1.0 (2026-01-09)
- 初始项目结构
- models、utils、types 基本组织
