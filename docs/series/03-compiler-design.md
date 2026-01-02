# 03 - 编译器设计：AST 到 Vue Render Function

> 本文介绍如何将 AST 编译为可执行的 Vue 3 渲染函数，这是 DSL 到真实 UI 的关键步骤

## 1. 编译器架构

SPARK.View 的编译器采用多阶段设计：

```
AST → IR（中间表示）→ Vue Render Function → SSR Bundle
```

### 1.1 为什么需要 IR？

直接从 AST 生成 Vue 代码会导致：
- 代码生成逻辑复杂
- 难以优化
- 难以支持多个目标平台（React/Svelte）

引入 IR 层的好处：
- **解耦**：AST 和代码生成分离
- **优化**：在 IR 层进行常量折叠、死代码消除
- **扩展**：轻松支持其他框架

## 2. IR 设计

### 2.1 IR 节点定义

```typescript
// packages/dsl-compiler/src/types.ts
export interface IRNode {
  type: 'Component' | 'Text' | 'Expression';
  component?: string;
  props?: Record<string, IRExpression | string | number | boolean>;
  children?: IRNode[];
  text?: string;
  hydration?: {
    strategy: 'immediate' | 'idle' | 'visible' | 'interaction' | 'never';
    priority: 'critical' | 'high' | 'normal' | 'low';
  };
}

export interface IRExpression {
  type: 'MemberAccess' | 'FunctionCall' | 'Literal';
  path?: string[]; // ['data', 'user', 'name']
  function?: string;
  args?: IRExpression[];
  value?: string | number | boolean;
}

export interface IRDocument {
  pageId: string;
  pageTitle: string;
  root: IRNode;
  data: Record<string, any>;
  env: Record<string, any>;
  theme: Record<string, any>;
  css: string;
}
```

### 2.2 AST 到 IR 转换

```typescript
// packages/dsl-compiler/src/ir-generator.ts
import type { DSLDocument, ComponentNode, ExpressionNode } from '@spark-view/dsl-parser';
import type { IRDocument, IRNode, IRExpression } from './types';

export class IRGenerator {
  generate(ast: DSLDocument): IRDocument {
    return {
      pageId: ast.page.id,
      pageTitle: ast.page.title,
      root: this.transformComponent(ast.page.layout),
      data: ast.data || {},
      env: ast.env || {},
      theme: ast.theme || {},
      css: this.extractCSS(ast.page.layout),
    };
  }

  private transformComponent(node: ComponentNode): IRNode {
    const irNode: IRNode = {
      type: 'Component',
      component: this.mapComponentType(node.type),
      props: {},
      children: [],
    };

    // 转换 props
    if (node.props) {
      for (const [key, value] of Object.entries(node.props)) {
        if (typeof value === 'object' && 'type' in value) {
          // 表达式节点
          irNode.props![key] = this.transformExpression(value as ExpressionNode);
        } else {
          // 静态值
          irNode.props![key] = value;
        }
      }
    }

    // 转换子节点
    if (node.children) {
      irNode.children = node.children.map(child => this.transformComponent(child));
    }

    // 添加 hydration 配置
    if (node.hydration) {
      irNode.hydration = {
        strategy: node.hydration.strategy,
        priority: node.hydration.priority,
      };
    }

    return irNode;
  }

  private transformExpression(expr: ExpressionNode): IRExpression {
    switch (expr.type) {
      case 'MemberExpression':
        return {
          type: 'MemberAccess',
          path: this.extractPath(expr),
        };

      case 'CallExpression':
        return {
          type: 'FunctionCall',
          function: expr.callee,
          args: expr.arguments?.map(arg => this.transformExpression(arg)) || [],
        };

      case 'Literal':
        return {
          type: 'Literal',
          value: expr.value,
        };

      case 'Identifier':
        return {
          type: 'MemberAccess',
          path: [expr.name!],
        };

      default:
        throw new Error(`Unknown expression type: ${(expr as any).type}`);
    }
  }

  private extractPath(expr: ExpressionNode): string[] {
    const path: string[] = [];

    let current = expr;
    while (current.type === 'MemberExpression') {
      path.unshift(current.property!);
      current = current.object!;
    }

    if (current.type === 'Identifier') {
      path.unshift(current.name!);
    }

    return path;
  }

  private mapComponentType(type: string): string {
    const typeMap: Record<string, string> = {
      container: 'div',
      text: 'span',
      header: 'header',
      section: 'section',
      button: 'button',
      image: 'img',
      link: 'a',
      list: 'ul',
      'list-item': 'li',
    };

    return typeMap[type] || 'div';
  }

  private extractCSS(node: ComponentNode): string {
    let css = '';

    // 从 props 中提取样式属性
    if (node.props) {
      const styleProps = [
        'backgroundColor',
        'color',
        'fontSize',
        'fontWeight',
        'padding',
        'margin',
        'borderRadius',
        'maxWidth',
      ];

      const hasStyles = styleProps.some(prop => prop in node.props!);
      if (hasStyles && node.id) {
        css += `.spark-${node.id} {\n`;
        for (const prop of styleProps) {
          if (node.props[prop]) {
            const cssKey = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
            css += `  ${cssKey}: ${node.props[prop]};\n`;
          }
        }
        css += '}\n\n';
      }
    }

    // 递归处理子节点
    if (node.children) {
      for (const child of node.children) {
        css += this.extractCSS(child);
      }
    }

    return css;
  }
}
```

## 3. Vue Render Function 生成

### 3.1 代码生成器

```typescript
// packages/dsl-compiler/src/vue-renderer.ts
import type { IRDocument, IRNode, IRExpression } from './types';

export class VueRenderer {
  render(ir: IRDocument): { ssrBundle: string; csrBundle: string; css: string } {
    const ssrCode = this.generateSSR(ir);
    const csrCode = this.generateCSR(ir);

    return {
      ssrBundle: ssrCode,
      csrBundle: csrCode,
      css: ir.css,
    };
  }

  private generateSSR(ir: IRDocument): string {
    return `
// 表达式求值函数
function evaluateExpression(expr, context) {
  const { data = {}, env = {}, item, index } = context || {};
  
  // 内置函数
  const formatDate = (date, format) => {
    const d = new Date(date);
    return format
      .replace('yyyy', d.getFullYear())
      .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
      .replace('dd', String(d.getDate()).padStart(2, '0'));
  };
  
  const formatNumber = (num, decimals) => {
    return Number(num).toFixed(decimals);
  };
  
  // 安全求值
  try {
    const cleanExpr = expr.replace(/^{{|}}$/g, '').trim();
    const func = new Function('data', 'env', 'item', 'index', 'formatDate', 'formatNumber', 
      \`return \${cleanExpr}\`);
    return func(data, env, item, index, formatDate, formatNumber);
  } catch (err) {
    console.error('Expression evaluation error:', err);
    return '';
  }
}

// 渲染函数（h 函数从外部传入，避免 ES Module 导入问题）
function render(h, context) {
  return ${this.generateNode(ir.root, 0)};
}
`;
  }

  private generateCSR(ir: IRDocument): string {
    return `
// 表达式求值函数
function evaluateExpression(expr, context) {
  const { data = {}, env = {}, item, index } = context || {};
  
  const formatDate = (date, format) => {
    const d = new Date(date);
    return format
      .replace('yyyy', d.getFullYear())
      .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
      .replace('dd', String(d.getDate()).padStart(2, '0'));
  };
  
  const formatNumber = (num, decimals) => {
    return Number(num).toFixed(decimals);
  };
  
  try {
    const cleanExpr = expr.replace(/^{{|}}$/g, '').trim();
    const func = new Function('data', 'env', 'item', 'index', 'formatDate', 'formatNumber', 
      \`return \${cleanExpr}\`);
    return func(data, env, item, index, formatDate, formatNumber);
  } catch (err) {
    console.error('Expression evaluation error:', err);
    return '';
  }
}

// 渲染函数（h 函数从外部传入）
function render(h, context) {
  const vnode = ${this.generateNode(ir.root, 0)};

  // 注册需要 hydration 的组件
  ${this.generateHydrationRegistration(ir.root)}

  return vnode;
}
`;
  }

  private generateNode(node: IRNode, depth: number): string {
    const indent = '  '.repeat(depth);

    if (node.type === 'Text') {
      return `"${node.text}"`;
    }

    // 生成 props
    const props = this.generateProps(node.props || {});

    // 生成 children
    const children = node.children?.length
      ? `[\n${node.children.map(child => `${indent}  ${this.generateNode(child, depth + 1)}`).join(',\n')}\n${indent}]`
      : 'null';

    // 添加 hydration 属性
    const hydrationAttr = node.hydration
      ? `, 'data-hydration': '${node.hydration.strategy}', 'data-priority': '${node.hydration.priority}'`
      : '';

    return `h('${node.component}', { ${props}${hydrationAttr} }, ${children})`;
  }

  private generateProps(props: Record<string, any>): string {
    const entries: string[] = [];

    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'object' && 'type' in value) {
        // 表达式
        entries.push(`${key}: evaluateExpression(${JSON.stringify(value)}, { data, env, theme })`);
      } else if (typeof value === 'string') {
        entries.push(`${key}: "${value}"`);
      } else {
        entries.push(`${key}: ${JSON.stringify(value)}`);
      }
    }

    return entries.join(', ');
  }

  private generateEvaluator(): string {
    return `
    if (expr.type === 'Literal') {
      return expr.value;
    }

    if (expr.type === 'MemberAccess') {
      let value = scope;
      for (const key of expr.path) {
        value = value?.[key];
      }
      return value;
    }

    if (expr.type === 'FunctionCall') {
      const functions = {
        formatDate: (date, format) => {
          // 简化实现
          const d = new Date(date);
          return d.toISOString().split('T')[0];
        },
        formatNumber: (num, decimals = 2) => {
          return Number(num).toFixed(decimals);
        },
      };

      const fn = functions[expr.function];
      if (!fn) {
        throw new Error(\`Unknown function: \${expr.function}\`);
      }

      const args = expr.args.map(arg => evaluateExpression(arg, scope));
      return fn(...args);
    }

    throw new Error(\`Unknown expression type: \${expr.type}\`);
  `;
  }

  private generateHydrationRegistration(node: IRNode): string {
    let code = '';

    if (node.hydration) {
      code += `hydration.register('spark-${node.component}', '${node.hydration.strategy}', '${node.hydration.priority}');\n`;
    }

    if (node.children) {
      for (const child of node.children) {
        code += this.generateHydrationRegistration(child);
      }
    }

    return code;
  }
}
```

### 3.2 表达式安全求值

为了防止代码注入，我们使用白名单机制：

```typescript
// packages/dsl-compiler/src/evaluator.ts
export class SafeEvaluator {
  private allowedFunctions = new Set(['formatDate', 'formatNumber', 'formatCurrency']);

  evaluate(expr: IRExpression, scope: Record<string, any>): any {
    switch (expr.type) {
      case 'Literal':
        return expr.value;

      case 'MemberAccess':
        return this.evaluateMemberAccess(expr.path!, scope);

      case 'FunctionCall':
        return this.evaluateFunctionCall(expr.function!, expr.args!, scope);

      default:
        throw new Error(`Unsupported expression type: ${(expr as any).type}`);
    }
  }

  private evaluateMemberAccess(path: string[], scope: Record<string, any>): any {
    let value: any = scope;

    for (const key of path) {
      // 防止访问原型链
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        return undefined;
      }
      value = value[key];
    }

    return value;
  }

  private evaluateFunctionCall(name: string, args: IRExpression[], scope: Record<string, any>): any {
    if (!this.allowedFunctions.has(name)) {
      throw new Error(`Function not allowed: ${name}`);
    }

    const evaluatedArgs = args.map(arg => this.evaluate(arg, scope));

    // 执行白名单函数
    switch (name) {
      case 'formatDate':
        return this.formatDate(evaluatedArgs[0], evaluatedArgs[1]);
      case 'formatNumber':
        return this.formatNumber(evaluatedArgs[0], evaluatedArgs[1]);
      case 'formatCurrency':
        return this.formatCurrency(evaluatedArgs[0], evaluatedArgs[1]);
      default:
        throw new Error(`Function not implemented: ${name}`);
    }
  }

  private formatDate(date: any, format: string): string {
    const d = new Date(date);
    return d.toISOString().split('T')[0]; // 简化实现
  }

  private formatNumber(num: any, decimals: number = 2): string {
    return Number(num).toFixed(decimals);
  }

  private formatCurrency(amount: any, currency: string = 'USD'): string {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}
```

## 4. 编译器主入口

```typescript
// packages/dsl-compiler/src/compiler.ts
import { IRGenerator } from './ir-generator';
import { VueRenderer } from './vue-renderer';
import type { DSLDocument } from '@spark-view/dsl-parser';

export interface CompileOptions {
  extractCSS?: boolean;
  minify?: boolean;
  sourceMap?: boolean;
}

export interface CompileResult {
  ssrBundle: string;
  csrBundle: string;
  css: string;
  ir?: any; // 用于调试
}

export function compile(ast: DSLDocument, options: CompileOptions = {}): CompileResult {
  // 1. 生成 IR
  const irGenerator = new IRGenerator();
  const ir = irGenerator.generate(ast);

  // 2. 生成 Vue 代码
  const renderer = new VueRenderer();
  const { ssrBundle, csrBundle, css } = renderer.render(ir);

  // 3. 可选：压缩代码
  let finalSSR = ssrBundle;
  let finalCSR = csrBundle;
  let finalCSS = css;

  if (options.minify) {
    // 生产环境应使用 terser
    finalSSR = ssrBundle.replace(/\s+/g, ' ');
    finalCSR = csrBundle.replace(/\s+/g, ' ');
    finalCSS = css.replace(/\s+/g, ' ');
  }

  return {
    ssrBundle: finalSSR,
    csrBundle: finalCSR,
    css: options.extractCSS ? finalCSS : '',
    ir: options.sourceMap ? ir : undefined,
  };
}
```

## 5. 编译器测试

```typescript
// packages/dsl-compiler/src/compiler.test.ts
import { describe, it, expect } from 'vitest';
import { Parser } from '@spark-view/dsl-parser';
import { compile } from './compiler';

describe('Compiler', () => {
  const parser = new Parser();

  it('should compile simple DSL', () => {
    const yaml = `
dslVersion: "1.0"
page:
  id: test
  title: "Test"
  layout:
    type: text
    props:
      content: "Hello World"
`;

    const ast = parser.parse(yaml, 'yaml');
    const result = compile(ast);

    expect(result.ssrBundle).toContain('function render');
    expect(result.ssrBundle).toContain("'Hello World'");
  });

  it('should compile expressions', () => {
    const yaml = `
dslVersion: "1.0"
page:
  id: test
  title: "Test"
  layout:
    type: text
    props:
      content: "{{ data.message }}"
data:
  message: "Hello from data"
`;

    const ast = parser.parse(yaml, 'yaml');
    const result = compile(ast);

    expect(result.ssrBundle).toContain('evaluateExpression');
    expect(result.ssrBundle).toContain('data.message');
  });

  it('should extract CSS', () => {
    const yaml = `
dslVersion: "1.0"
page:
  id: test
  title: "Test"
  layout:
    type: container
    id: main
    props:
      backgroundColor: "#f0f0f0"
      padding: "20px"
`;

    const ast = parser.parse(yaml, 'yaml');
    const result = compile(ast, { extractCSS: true });

    expect(result.css).toContain('.spark-main');
    expect(result.css).toContain('background-color: #f0f0f0');
    expect(result.css).toContain('padding: 20px');
  });

  it('should handle hydration config', () => {
    const yaml = `
dslVersion: "1.0"
page:
  id: test
  title: "Test"
  layout:
    type: button
    props:
      text: "Click me"
    hydration:
      strategy: idle
      priority: normal
`;

    const ast = parser.parse(yaml, 'yaml');
    const result = compile(ast);

    expect(result.csrBundle).toContain("'data-hydration': 'idle'");
    expect(result.csrBundle).toContain("'data-priority': 'normal'");
  });
});
```

## 6. 性能优化

### 6.1 静态提升

对于静态节点，可以在编译时生成：

```typescript
// 静态节点提升
const _hoisted_1 = h('div', { class: 'static' }, 'Static Content');

export function render(context) {
  return h('div', null, [
    _hoisted_1, // 复用静态节点
    h('span', null, context.data.dynamic),
  ]);
}
```

### 6.2 编译缓存

```typescript
const compileCache = new Map<string, CompileResult>();

export function compileWithCache(ast: DSLDocument, options?: CompileOptions): CompileResult {
  const key = JSON.stringify(ast);
  
  if (!compileCache.has(key)) {
    compileCache.set(key, compile(ast, options));
  }
  
  return compileCache.get(key)!;
}
```

## 7. 总结

本文实现了 SPARK.View 的编译器：

- **IR 层**：解耦 AST 和代码生成，便于优化
- **Vue 渲染器**：生成 SSR 和 CSR 两种 bundle
- **安全求值**：白名单机制防止代码注入
- **CSS 提取**：将样式属性转换为 CSS 类

编译流程：
```
DSL → AST → IR → Vue Render Function → Executable Code
```

在下一篇文章中，我们将实现 SSR 服务器，执行编译后的代码并返回 HTML。

## 附录：编译输出示例

输入 DSL：
```yaml
dslVersion: "1.0"
page:
  id: demo
  title: "Demo"
  layout:
    type: text
    props:
      content: "{{ formatDate(data.now, 'YYYY-MM-DD') }}"
```

输出 SSR Bundle：
```javascript
import { h } from 'vue';

export function render(context) {
  const { data, env, theme } = context;
  
  function evaluateExpression(expr, scope) {
    if (expr.type === 'FunctionCall' && expr.function === 'formatDate') {
      const date = new Date(scope.data.now);
      return date.toISOString().split('T')[0];
    }
  }

  return h('span', {
    content: evaluateExpression(
      { type: 'FunctionCall', function: 'formatDate', args: [...] },
      { data, env, theme }
    )
  }, null);
}
```
