# @spark-view/dsl-parser

将 YAML/JSON DSL 解析为抽象语法树（AST）。

## 功能特性

- **多格式支持**: YAML 和 JSON
- **Schema 验证**: 基于 JSON Schema 的自动验证
- **表达式解析**: 解析 `{{ ... }}` 表达式为 AST
- **类型安全**: 完整的 TypeScript 类型定义
- **错误报告**: 详细的错误信息（行号、列号）

## 安装

```bash
pnpm add @spark-view/dsl-parser
```

## 使用方式

### 基础用法

```typescript
import { parse } from '@spark-view/dsl-parser';

const yamlContent = `
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
  message: "Hello World"
`;

const ast = parse(yamlContent, 'yaml');

console.log(ast.page.id); // "home"
console.log(ast.data.message); // "Hello World"
```

### 解析表达式

```typescript
import { parseExpression } from '@spark-view/dsl-parser';

// 成员访问
const expr1 = parseExpression('{{ data.title }}');
console.log(expr1);
// {
//   type: 'MemberExpression',
//   object: { type: 'Identifier', name: 'data' },
//   property: { type: 'Identifier', name: 'title' }
// }

// 函数调用
const expr2 = parseExpression('{{ formatDate(data.createdAt, "yyyy-MM-dd") }}');
console.log(expr2);
// {
//   type: 'CallExpression',
//   callee: { type: 'Identifier', name: 'formatDate' },
//   arguments: [...]
// }
```

### 处理循环

```typescript
const yaml = `
dslVersion: "1.0"
page:
  id: list
  title: "Products"
  layout:
    type: grid
    children:
      - type: container
        loop:
          items: "data.products"
          itemVar: "product"
          indexVar: "i"
        children:
          - type: text
            props:
              content: "{{ product.name }}"
data:
  products:
    - name: "Product A"
    - name: "Product B"
`;

const ast = parse(yaml, 'yaml');
const loopNode = ast.page.layout.children[0];

console.log(loopNode.loop);
// {
//   items: 'data.products',
//   itemVar: 'product',
//   indexVar: 'i'
// }
```

## AST 结构

### DSLDocument

```typescript
interface DSLDocument {
  dslVersion: string;
  page: PageNode;
  data?: Record<string, any>;
  env?: Record<string, string>;
  theme?: ThemeConfig;
}
```

### ComponentNode

```typescript
interface ComponentNode {
  type: string;
  id?: string;
  props?: Record<string, any>;
  children?: Array<ComponentNode | string>;
  condition?: string;
  loop?: LoopConfig;
  hydration?: HydrationStrategy;
}
```

### ExpressionNode

```typescript
interface ExpressionNode {
  type: 'MemberExpression' | 'CallExpression' | 'Literal' | 'Identifier';
  object?: ExpressionNode;
  property?: ExpressionNode;
  callee?: ExpressionNode;
  arguments?: ExpressionNode[];
  value?: any;
  name?: string;
}
```

## 表达式语法

支持的表达式类型：

1. **成员访问**: `data.xxx`, `env.xxx`, `item.name`
2. **嵌套访问**: `data.user.profile.name`
3. **函数调用**: `formatDate(data.time, "yyyy-MM-dd")`
4. **字面量**: 字符串、数字

### 白名单函数

为安全起见，仅支持以下内置函数：

- `formatDate(date, format)` - 日期格式化
- `formatNumber(number, decimals)` - 数字格式化

**禁止**使用 `eval()`, `new Function()` 等危险操作。

## 错误处理

```typescript
import { parse, ParseError } from '@spark-view/dsl-parser';

try {
  const ast = parse(invalidYaml, 'yaml');
} catch (error) {
  if (error instanceof ParseError) {
    console.error(`Parse error at line ${error.line}: ${error.message}`);
  }
}
```

## 测试

```bash
# 运行测试
pnpm test

# 监听模式
pnpm test:watch

# 覆盖率
pnpm test -- --coverage
```

## 开发指南

### 添加新的表达式类型

1. 在 [types.ts](./src/types.ts) 中扩展 `ExpressionNode`
2. 在 [lexer.ts](./src/lexer.ts) 中添加新的 Token 类型
3. 在 [parser.ts](./src/parser.ts) 中实现解析逻辑
4. 添加测试用例

### Lexer → Parser 流程

```
YAML/JSON → parse() → validateSchema() → DSLDocument AST
Expression → tokenize() → parseExpressionFromTokens() → ExpressionNode AST
```

## 相关文档

- [系列文章 02 - DSL 编译链：Lexer → AST → IR](../../docs/series/02-compiler-implementation.md)
- [DSL Spec](../dsl-spec/README.md)

## 许可证

MIT
