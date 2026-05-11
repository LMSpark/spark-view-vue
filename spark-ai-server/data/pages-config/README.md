# Pages Configuration

该目录包含所有动态页面的配置文件，包括表单规则、页面数据、样式和脚本。

## 📍 位置说明

**为什么在 `spark-ai-server/data/pages-config/` 下？**

- ✅ **后端管理** - 页面配置由 Java 后端提供 RESTful CRUD API
- ✅ **Git 跟踪** - 配置文件纳入版本控制，可追溯变更历史
- ✅ **租户隔离** - 目录按 `{tenantId}/{projectId}/{pageId}/` 组织
- ✅ **清晰分离** - 配置数据与前端源码分离

## 目录结构

```
spark-ai-server/data/pages-config/
└── {tenantId}/{projectId}/{pageId}/
    ├── rule.json               # 规则配置（必需）
    ├── pagedata.json           # 页面数据配置（必需）
    ├── style.css               # 页面样式（可选）
    └── script.js               # 页面脚本（可选）
```

## 文件说明

### 路由注册
页面路由由**导航配置**（`navigation_config` 数据库表）统一管理，不再使用独立的 `routes.json`。
导航节点的 `path` 字段即为页面路由路径，框架自动注册动态路由。

### rule.json - 规则配置
基于 SPARK 组件系统的页面配置：

```json
[
  {
    "type": "input",
    "field": "name",
    "title": "用户名"
  }
]
```

### pagedata.json - 页面数据
包含数据集定义和零代码配置：

> 注意：从现在起，框架会**将任意 pagedata.json 归一化为 DataSet**（顶层键映射为表，数组/对象/基础类型均会转换为表的 rows）。请始终以 `dataset` 语义为目标结构或让框架自动归一化。

```json
{
  "dataSets": {
    "Users": {
      "tableName": "Users",
      "columns": [...]
    }
  },
  "zeroCode": {
    "Users": {
      "api": "/api/getUsers",
      "autoLoad": true
    }
  }
}
```

### style.css - 页面样式
可选的页面级 CSS，自动添加作用域隔离。

### script.js - 页面脚本
可选的页面级 JavaScript，在 `with(__ctx)` 沙箱内执行：

```javascript
function __init__() {
  // 页面初始化入口（渲染器挂载后自动调用）
  console.log('Page initialized')
}

function handleClick() {
  $page.showMessage('Button clicked', 'info')
}
```

> 详见项目根目录 `copilot-instructions.md` 中的「页面脚本沙箱规范」章节。

## 使用方式

页面配置通过 Java 后端 RESTful API 加载，前端无需直接引用文件路径：

```
GET  /api/pages-config/{pageId}/{file}     # 读取单个文件
PUT  /api/pages-config/{pageId}/{file}     # 写入单个文件
POST /api/pages-config/{pageId}/__batch    # 批量写入 + 自动注册路由
GET  /api/pages-config/__list              # 列出所有页面
```

## 编辑工作流

通过页面配置编辑器或后端 API：
1. 点击「➕ 新建页面」
2. 填写 Page ID 和标题
3. 在文件编辑 Tab 中编辑 rule.json / pagedata.json / script.js / style.css
4. 保存后在导航节点的 `path` 字段关联即可访问

## 最佳实践

- ✅ 每个页面一个目录，kebab-case 命名
- ✅ 必需：rule.json, pagedata.json；可选：style.css, script.js
- ✅ 大数据集通过 `api.list` 配置远程加载，内联数据仅用于静态小表
- ✅ 优先通过 `rule.json` / `pagedata.json` 配置解决需求，减少 script.js 代码量
