# 异步数据加载 - 快速参考

## 📝 配置示例

### 静态数据
```json
{ "title": "标题文本" }
```

### API 配置
```json
{
  "users": {
    "url": "/api/users",
    "method": "GET",
    "params": { "page": 1 },
    "dataPath": "data.list",
    "autoLoad": true
  }
}
```

## 🛠️ 脚本方法

```javascript
import { $refreshData, $data } from '../common.js'

// 刷新所有 API 数据
await $refreshData()

// 刷新指定数据
await $refreshData('users')

// 获取数据
const users = $data().users
```

## 📊 Rule 绑定

```json
{
  "type": "el-table",
  "dataKey": "users",
  "props": { "border": true }
}
```

## 🔑 关键点

- ✅ 支持混合使用静态数据和 API 配置
- ✅ `autoLoad: true` - 页面加载时自动请求
- ✅ `autoLoad: false` - 手动调用 `$refreshData()` 加载
- ✅ 数据响应式更新，UI 自动刷新
- ✅ SSR 兼容

## 📁 文件结构

```
pages/demo/
  ├── rule.json    # UI 配置
  ├── data.json    # 数据配置（可含 API）
  └── style.css    # 样式

pageScripts/demo/
  └── script.js    # 事件处理（可调用 $refreshData）
```

## 🚀 测试地址

访问 `/async-demo` 查看完整示例

## 📖 详细文档

查看 `ASYNC_DATA_LOADING.md` 获取完整文档
