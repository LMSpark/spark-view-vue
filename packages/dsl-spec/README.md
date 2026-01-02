# @spark-view/dsl-spec

DSL JSON Schema 定义与示例文件。

## 概述

本 package 提供 SPARK.View DSL 的完整 JSON Schema 定义（版本 1.0），以及 YAML 和 JSON 格式的示例文件。

## Schema 特性

- **dslVersion**: 1.0（固定版本标识）
- **组件类型**: container, header, footer, section, text, button, image, link, list, grid, flex, form, input, select
- **表达式**: 支持 `{{ data.xxx }}`, `{{ env.xxx }}`, `{{ formatDate(...) }}`, `{{ formatNumber(...) }}`
- **条件渲染**: 通过 `condition` 属性
- **循环渲染**: 通过 `loop` 配置（items, itemVar, indexVar）
- **水合策略**: immediate, idle, visible, interaction, never（4 个优先级：critical, high, normal, low）

## 文件结构

```
dsl-spec/
├── src/
│   ├── schema.json          # JSON Schema 定义
│   └── examples/
│       ├── basic-page.yaml  # YAML 示例（首页）
│       └── basic-page.json  # JSON 示例（产品列表）
├── package.json
└── README.md
```

## 使用方式

### 验证 DSL 文件

```bash
# 安装依赖
pnpm install

# 验证示例文件
pnpm validate
```

### 在其他 Package 中引用 Schema

```typescript
import schema from '@spark-view/dsl-spec/src/schema.json';
import Ajv from 'ajv';

const ajv = new Ajv();
const validate = ajv.compile(schema);

const isValid = validate(dslObject);
if (!isValid) {
  console.error(validate.errors);
}
```

## DSL 示例

### 基础页面（YAML）

```yaml
dslVersion: "1.0"
page:
  id: home
  title: "Welcome"
  layout:
    type: container
    children:
      - type: text
        props:
          content: "{{ data.message }}"
data:
  message: "Hello SPARK.View!"
```

### 带循环的产品列表（JSON）

```json
{
  "dslVersion": "1.0",
  "page": {
    "layout": {
      "type": "grid",
      "children": [
        {
          "type": "container",
          "loop": {
            "items": "data.products",
            "itemVar": "product"
          },
          "children": [...]
        }
      ]
    }
  },
  "data": {
    "products": [...]
  }
}
```

## 表达式语法

### 数据访问

- `{{ data.title }}` - 访问 page.data 中的字段
- `{{ env.API_URL }}` - 访问环境变量
- `{{ product.name }}` - 循环中的局部变量

### 内置函数

- `formatDate(date, format)` - 日期格式化（ISO → 'yyyy-MM-dd'）
- `formatNumber(num, decimals)` - 数字格式化（小数位数）

### 安全性

- **禁止** `eval()` / `new Function()`
- **仅支持** 白名单表达式（data/env 访问 + 内置函数）
- 编译时进行静态分析与验证

## 水合策略

| Strategy | 描述 | 适用场景 |
|----------|------|----------|
| immediate | 立即水合 | 关键交互组件（导航、表单） |
| idle | 空闲时水合 | 非关键交互（点赞、分享） |
| visible | 可见时水合 | 视口外组件（评论区、推荐） |
| interaction | 交互触发水合 | 模态框、折叠面板 |
| never | 永不水合 | 纯静态内容（版权信息、Banner） |

## 版本策略

- **当前版本**: 1.0
- **向后兼容**: 1.x 系列保持 Schema 兼容
- **破坏性更新**: 递增主版本（2.0, 3.0）

## 相关文档

- [系列文章 01 - 设计 DSL Schema 与版本策略](../../docs/series/01-dsl-schema-design.md)
- [JSON Schema 官方文档](https://json-schema.org/)

## 许可证

MIT
