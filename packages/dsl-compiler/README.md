# @spark-view/dsl-compiler

将 DSL AST 编译为 Vue 3 Render Function，支持 SSR 和部分水合。

## 功能特性

- **AST → IR**: 将解析后的 AST 转换为简化的中间表示
- **IR → Vue**: 生成 Vue 3 Render Function（h 函数）
- **安全表达式**: 使用受限求值器，禁止 eval/new Function 滥用
- **水合提示**: 自动生成 hydrationHints，支持部分水合策略
- **代码分割**: 按水合策略生成客户端 chunks
- **Critical CSS**: 可选的关键 CSS 提取

## 安装

```bash
pnpm add @spark-view/dsl-compiler
```

## 使用方式

### 基础编译

```typescript
import { compile } from '@spark-view/dsl-compiler';
import { parse } from '@spark-view/dsl-parser';

const yaml = `
dslVersion: "1.0"
page:
  id: home
  title: "Home"
  layout:
    type: container
    children:
      - type: text
        props:
          content: "{{ data.message }}"
data:
  message: "Hello SPARK.View"
`;

const ast = parse(yaml, 'yaml');
const output = compile(ast);

console.log(output.ssrBundle); // Vue Render Function 代码
console.log(output.hydrationHints); // 水合提示
console.log(output.clientChunks); // 客户端 chunks
```

### 启用 Critical CSS

```typescript
const output = compile(ast, {
  extractCSS: true,
  optimize: true,
  minify: false,
});

console.log(output.criticalCSS); // 提取的关键 CSS
```

## 编译流程

```
DSL AST → IR Generator → IR → Vue Renderer → Vue Render Function
                                          ↓
                               Hydration Hints + Client Chunks
```

### 1. IR Generator

将 AST 转换为简化的 IR（中间表示）：

```typescript
import { IRGenerator } from '@spark-view/dsl-compiler';

const generator = new IRGenerator();
const ir = generator.generate(dslAst);

console.log(ir);
// {
//   type: 'element',
//   tag: 'div',
//   props: { class: 'container' },
//   children: [...]
// }
```

### 2. Vue Renderer

将 IR 转换为 Vue Render Function：

```typescript
import { VueRenderer } from '@spark-view/dsl-compiler';

const renderer = new VueRenderer();
const { code, hydrationHints } = renderer.render(ir);

console.log(code);
// 生成的 Vue Render Function 代码
```

## 输出结构

### CompileOutput

```typescript
interface CompileOutput {
  ssrBundle: string; // Vue Render Function 代码
  clientChunks: string[]; // 客户端 chunk 文件名
  criticalCSS?: string; // 关键 CSS
  hydrationHints: HydrationHint[]; // 水合提示
  ir: IRNode; // 中间表示
}
```

### HydrationHint

```typescript
interface HydrationHint {
  id: string; // 组件 ID
  strategy: 'immediate' | 'idle' | 'visible' | 'interaction' | 'never';
  priority?: 'critical' | 'high' | 'normal' | 'low';
  trigger?: string; // 触发器选择器
  viewport?: {
    // IntersectionObserver 配置
    rootMargin?: string;
    threshold?: number;
  };
}
```

## 安全表达式求值

编译器生成的代码包含安全的表达式求值器：

```javascript
function evaluateExpression(expr, context) {
  const { data, env, item, index } = context;

  // 白名单函数
  const formatDate = (date, format) => {
    /* ... */
  };
  const formatNumber = (num, decimals) => {
    /* ... */
  };

  // 使用 Function 构造函数（受限环境）
  const func = new Function(
    'data',
    'env',
    'item',
    'index',
    'formatDate',
    'formatNumber',
    `return ${cleanExpr}`
  );

  return func(data, env, item, index, formatDate, formatNumber);
}
```

### 支持的表达式

- ✅ `data.xxx`, `env.xxx`
- ✅ `item.xxx`（循环中）
- ✅ `formatDate(data.time, 'yyyy-MM-dd')`
- ✅ `formatNumber(data.price, 2)`
- ❌ `eval()`, `Function()`, `import()`, `require()`

## 示例输出

### 输入 DSL

```yaml
dslVersion: '1.0'
page:
  id: product
  title: 'Product'
  layout:
    type: container
    children:
      - type: button
        id: add-to-cart
        props:
          text: 'Add to Cart'
          onClick: 'addToCart'
        hydration:
          strategy: idle
          priority: normal
```

### 输出（简化）

```javascript
import { h, createSSRApp } from 'vue';

function evaluateExpression(expr, context) {
  /* ... */
}

export function render(context) {
  return h(
    'div',
    {},
    [
      h(
        'button',
        {
          onClick: evaluateExpression('addToCart', context),
          'data-hydration-id': 'add-to-cart',
        },
        [evaluateExpression('Add to Cart', context)]
      ),
    ]
  );
}

export function createApp(context) {
  return createSSRApp({
    setup() {
      return () => render(context);
    },
  });
}
```

## 性能优化

### 代码分割

按水合策略自动分割客户端代码：

- `chunk-immediate.js` - 立即水合的组件
- `chunk-idle.js` - 空闲时水合
- `chunk-visible.js` - 可见时水合
- `chunk-interaction.js` - 交互触发

### Critical CSS 提取

```typescript
const output = compile(ast, { extractCSS: true });

// 在 HTML head 中内联
`<style>${output.criticalCSS}</style>`;
```

## 测试

```bash
# 运行测试
pnpm test

# 监听模式
pnpm test:watch
```

## 相关文档

- [系列文章 02 - DSL 编译链：Lexer → AST → IR](../../docs/series/02-compiler-implementation.md)
- [系列文章 04 - DSL 驱动的 SSR：端到端实现](../../docs/series/04-dsl-driven-ssr.md)
- [Vue Render Function 文档](https://vuejs.org/guide/extras/render-function.html)

## 许可证

MIT
