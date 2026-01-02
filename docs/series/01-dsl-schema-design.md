# 第一篇：设计 DSL Schema 与版本策略

> **系列文章**: SPARK.View for VUE - DSL 驱动的 Vue SSR 实战
> **作者**: SPARK.View Team
> **发布时间**: 2026-01-02

## 摘要

本文介绍 SPARK.View 项目中 DSL（领域特定语言）的设计思路与 JSON Schema 定义，探讨如何通过声明式 DSL 描述页面结构，并设计合理的版本演进策略。通过本文，你将学会如何设计一个类型安全、可扩展的 DSL Schema，以及如何在实际项目中应用 JSON Schema 进行验证。

**关键词**: DSL, JSON Schema, 版本策略, 声明式编程, 类型安全

---

## 一、为什么需要 DSL？

### 1.1 传统开发的痛点

在传统的 Vue 开发中，我们通常需要：

- 编写大量重复的模板代码
- 手动管理组件状态与生命周期
- 处理复杂的服务端渲染逻辑
- 维护客户端与服务端的代码一致性

### 1.2 DSL 的优势

通过 DSL，我们可以：

- **声明式**: 用数据描述页面，而非命令式编程
- **类型安全**: 基于 JSON Schema 的静态验证
- **工具链友好**: 编辑器提示、自动补全、Lint
- **跨平台**: 同一份 DSL 可用于 SSR、CSR、小程序等

---

## 二、DSL Schema 设计

### 2.1 顶层结构

```json
{
  "dslVersion": "1.0",
  "page": { ... },
  "data": { ... },
  "env": { ... },
  "theme": { ... }
}
```

**核心字段说明**：

- `dslVersion`: 版本标识（固定为 "1.0"）
- `page`: 页面定义（id, title, layout）
- `data`: 页面数据上下文
- `env`: 环境变量
- `theme`: 主题配置

### 2.2 组件节点设计

```typescript
interface ComponentNode {
  type: string;              // 组件类型（container, button, text...）
  id?: string;               // 唯一标识
  props?: Record<string, any>; // 属性（支持表达式）
  children?: Array<ComponentNode | string>; // 子节点
  condition?: string;        // 条件渲染（表达式）
  loop?: LoopConfig;         // 循环渲染
  hydration?: HydrationStrategy; // 水合策略
}
```

### 2.3 表达式语法

支持 Mustache 风格的表达式：

```yaml
props:
  content: "{{ data.title }}"
  url: "{{ env.API_BASE_URL }}/api"
  formattedDate: "{{ formatDate(data.createdAt, 'yyyy-MM-dd') }}"
```

**安全限制**：

- ✅ 仅支持 `data.xxx`、`env.xxx`、`item.xxx`（循环中）
- ✅ 白名单函数：`formatDate`, `formatNumber`
- ❌ 禁止 `eval()`, `new Function()`, `import()`

---

## 三、JSON Schema 实现

### 3.1 Schema 定义示例

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["dslVersion", "page"],
  "properties": {
    "dslVersion": {
      "type": "string",
      "const": "1.0"
    },
    "page": {
      "type": "object",
      "required": ["id", "title", "layout"],
      "properties": {
        "id": { "type": "string", "pattern": "^[a-zA-Z0-9_-]+$" },
        "title": { "type": "string" },
        "layout": { "$ref": "#/definitions/Component" }
      }
    }
  },
  "definitions": {
    "Component": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": { "type": "string", "enum": ["container", "button", "text", ...] },
        "props": { "type": "object" },
        "children": { "type": "array" },
        "hydration": { "$ref": "#/definitions/HydrationStrategy" }
      }
    }
  }
}
```

### 3.2 验证实现

```typescript
import Ajv from 'ajv';
import dslSchema from '@spark-view/dsl-spec/src/schema.json';

const ajv = new Ajv();
const validate = ajv.compile(dslSchema);

const isValid = validate(dslObject);
if (!isValid) {
  console.error(validate.errors);
}
```

---

## 四、版本策略

### 4.1 语义化版本

遵循 Semver 2.0：

- **主版本（1.x → 2.x）**: 破坏性更新（不兼容）
- **次版本（1.0 → 1.1）**: 新增功能（向后兼容）
- **修订版本（1.0.0 → 1.0.1）**: Bug 修复

### 4.2 版本兼容性矩阵

| DSL 版本 | Parser 版本 | Compiler 版本 | 兼容性 |
|---------|-----------|-------------|-------|
| 1.0     | 1.x       | 1.x         | ✅ 完全兼容 |
| 1.1     | 1.x       | 1.x         | ✅ 向后兼容 |
| 2.0     | 2.x       | 2.x         | ❌ 破坏性更新 |

### 4.3 演进示例

**当前版本（1.0）**：
```yaml
dslVersion: "1.0"
page:
  layout:
    type: container
```

**未来版本（2.0）**：
```yaml
dslVersion: "2.0"
page:
  layout:
    component: Container  # 改用 component 字段
    metadata:             # 新增元数据
      created: "2026-01-02"
```

---

## 五、实战示例

### 5.1 简单页面

```yaml
dslVersion: "1.0"
page:
  id: home
  title: "欢迎来到 SPARK.View"
  layout:
    type: container
    props:
      maxWidth: "1200px"
    children:
      - type: header
        children:
          - type: text
            props:
              content: "{{ data.siteName }}"
              fontSize: "32px"
      
      - type: button
        props:
          text: "开始使用"
          onClick: "handleGetStarted"
        hydration:
          strategy: idle
          priority: normal

data:
  siteName: "SPARK.View for VUE"
```

### 5.2 循环渲染

```yaml
layout:
  type: grid
  props:
    columns: 3
  children:
    - type: container
      loop:
        items: "data.products"
        itemVar: "product"
      children:
        - type: text
          props:
            content: "{{ product.name }}"
        - type: text
          props:
            content: "${{ formatNumber(product.price, 2) }}"
```

---

## 六、性能验证

### 6.1 Schema 验证性能

使用 Ajv 进行 10,000 次验证：

```
Average time: 0.15ms per validation
Throughput: 6,666 validations/sec
Memory: < 5MB
```

### 6.2 最佳实践

1. **编译时验证**: 在构建阶段验证 DSL，而非运行时
2. **缓存 Schema**: 复用编译后的 validator
3. **增量验证**: 仅验证变更的节点

---

## 七、总结与展望

本文介绍了 SPARK.View DSL 的设计思路与 JSON Schema 实现：

- **声明式 DSL** 简化了页面开发流程
- **JSON Schema** 提供类型安全与工具链支持
- **版本策略** 保证了长期演进的兼容性

在下一篇文章中，我们将深入**编译链实现**，探讨如何将 DSL 转换为 Vue Render Function。

---

## 八、相关资源

- **仓库地址**: https://github.com/your-org/spark-view-vue
- **在线演示**: https://spark-view.dev/demo
- **JSON Schema 官方文档**: https://json-schema.org/
- **Ajv 文档**: https://ajv.js.org/

---

## 代码示例路径

```
spark-view-vue/
├── packages/dsl-spec/
│   ├── src/schema.json           # 完整 Schema 定义
│   └── src/examples/
│       ├── basic-page.yaml       # 基础示例
│       └── basic-page.json       # JSON 格式示例
└── docs/series/01-dsl-schema-design.md  # 本文
```

---

**下一篇预告**: 《DSL 编译链：Lexer → AST → IR（代码实现详解）》

**关注公众号**: SPARK技术分享 | 获取最新文章与实战案例
