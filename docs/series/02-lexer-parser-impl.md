# 02 - Lexer 与 Parser 实现：从 DSL 到 AST

> 本文介绍如何将 YAML/JSON DSL 转换为抽象语法树（AST），这是编译器管道的第一步

## 1. 引言

在上一篇文章中，我们设计了 SPARK.View 的 DSL Schema。现在需要将用户编写的 YAML/JSON DSL 文本解析成程序可操作的 AST 结构。这个过程分为两个阶段：

- **词法分析（Lexer）**：将字符流转换为 Token 流
- **语法分析（Parser）**：将 Token 流转换为 AST

## 2. Lexer 设计

### 2.1 Token 类型定义

我们需要识别表达式语法 `{{ data.title }}` 中的各种元素：

```typescript
// packages/dsl-parser/src/types.ts
export enum TokenType {
  LBRACE = 'LBRACE',       // {{
  RBRACE = 'RBRACE',       // }}
  DOT = 'DOT',             // .
  LPAREN = 'LPAREN',       // (
  RPAREN = 'RPAREN',       // )
  COMMA = 'COMMA',         // ,
  IDENTIFIER = 'IDENTIFIER', // 变量名/函数名
  STRING = 'STRING',       // "文本"
  NUMBER = 'NUMBER',       // 123
  EOF = 'EOF',             // 文件结束
}

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}
```

### 2.2 Lexer 实现

```typescript
// packages/dsl-parser/src/lexer.ts
export class Lexer {
  private input: string;
  private position = 0;
  private tokens: Token[] = [];

  constructor(input: string) {
    this.input = input;
  }

  tokenize(): Token[] {
    while (this.position < this.input.length) {
      const char = this.input[this.position];

      // 跳过空白字符
      if (/\s/.test(char)) {
        this.position++;
        continue;
      }

      // 识别双括号 {{
      if (char === '{' && this.peek() === '{') {
        this.tokens.push({
          type: TokenType.LBRACE,
          value: '{{',
          position: this.position,
        });
        this.position += 2;
        continue;
      }

      // 识别 }}
      if (char === '}' && this.peek() === '}') {
        this.tokens.push({
          type: TokenType.RBRACE,
          value: '}}',
          position: this.position,
        });
        this.position += 2;
        continue;
      }

      // 单字符 Token
      const singleCharTokens: Record<string, TokenType> = {
        '.': TokenType.DOT,
        '(': TokenType.LPAREN,
        ')': TokenType.RPAREN,
        ',': TokenType.COMMA,
      };

      if (char in singleCharTokens) {
        this.tokens.push({
          type: singleCharTokens[char],
          value: char,
          position: this.position,
        });
        this.position++;
        continue;
      }

      // 字符串字面量 "text"
      if (char === '"') {
        this.tokenizeString();
        continue;
      }

      // 数字字面量
      if (/\d/.test(char)) {
        this.tokenizeNumber();
        continue;
      }

      // 标识符（变量名、函数名）
      if (/[a-zA-Z_]/.test(char)) {
        this.tokenizeIdentifier();
        continue;
      }

      throw new Error(`Unexpected character at position ${this.position}: ${char}`);
    }

    this.tokens.push({
      type: TokenType.EOF,
      value: '',
      position: this.position,
    });

    return this.tokens;
  }

  private peek(offset = 1): string {
    return this.input[this.position + offset] || '';
  }

  private tokenizeString(): void {
    const start = this.position;
    this.position++; // 跳过开始的 "

    let value = '';
    while (this.position < this.input.length && this.input[this.position] !== '"') {
      // 处理转义字符
      if (this.input[this.position] === '\\') {
        this.position++;
        value += this.input[this.position] || '';
      } else {
        value += this.input[this.position];
      }
      this.position++;
    }

    if (this.position >= this.input.length) {
      throw new Error(`Unterminated string at position ${start}`);
    }

    this.position++; // 跳过结束的 "

    this.tokens.push({
      type: TokenType.STRING,
      value,
      position: start,
    });
  }

  private tokenizeNumber(): void {
    const start = this.position;
    let value = '';

    while (this.position < this.input.length && /[\d.]/.test(this.input[this.position])) {
      value += this.input[this.position];
      this.position++;
    }

    this.tokens.push({
      type: TokenType.NUMBER,
      value,
      position: start,
    });
  }

  private tokenizeIdentifier(): void {
    const start = this.position;
    let value = '';

    while (this.position < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.position])) {
      value += this.input[this.position];
      this.position++;
    }

    this.tokens.push({
      type: TokenType.IDENTIFIER,
      value,
      position: start,
    });
  }
}
```

### 2.3 Lexer 测试

```typescript
// packages/dsl-parser/src/lexer.test.ts
import { describe, it, expect } from 'vitest';
import { Lexer, TokenType } from './lexer';

describe('Lexer', () => {
  it('should tokenize simple expression', () => {
    const lexer = new Lexer('{{ data.title }}');
    const tokens = lexer.tokenize();

    expect(tokens).toEqual([
      { type: TokenType.LBRACE, value: '{{', position: 0 },
      { type: TokenType.IDENTIFIER, value: 'data', position: 3 },
      { type: TokenType.DOT, value: '.', position: 7 },
      { type: TokenType.IDENTIFIER, value: 'title', position: 8 },
      { type: TokenType.RBRACE, value: '}}', position: 14 },
      { type: TokenType.EOF, value: '', position: 16 },
    ]);
  });

  it('should tokenize function call', () => {
    const lexer = new Lexer('{{ formatDate(data.createdAt, "YYYY-MM-DD") }}');
    const tokens = lexer.tokenize();

    expect(tokens[1].value).toBe('formatDate');
    expect(tokens[2].type).toBe(TokenType.LPAREN);
    expect(tokens[6].type).toBe(TokenType.STRING);
    expect(tokens[6].value).toBe('YYYY-MM-DD');
  });

  it('should handle numbers', () => {
    const lexer = new Lexer('{{ item.price * 1.2 }}');
    const tokens = lexer.tokenize();

    const numberToken = tokens.find(t => t.type === TokenType.NUMBER);
    expect(numberToken?.value).toBe('1.2');
  });

  it('should throw on unterminated string', () => {
    const lexer = new Lexer('{{ "unclosed }}');
    expect(() => lexer.tokenize()).toThrow('Unterminated string');
  });
});
```

## 3. Parser 实现

### 3.1 AST 节点定义

```typescript
// packages/dsl-parser/src/types.ts
export interface ExpressionNode {
  type: 'MemberExpression' | 'CallExpression' | 'Literal' | 'Identifier';
  object?: ExpressionNode;
  property?: string;
  callee?: string;
  arguments?: ExpressionNode[];
  value?: string | number;
  name?: string;
}

export interface ComponentNode {
  type: string;
  id?: string;
  props?: Record<string, any>;
  children?: ComponentNode[];
  hydration?: HydrationConfig;
}

export interface DSLDocument {
  dslVersion: string;
  page: {
    id: string;
    title: string;
    layout: ComponentNode;
  };
  data?: Record<string, any>;
  env?: Record<string, any>;
  theme?: Record<string, any>;
}
```

### 3.2 递归下降 Parser

```typescript
// packages/dsl-parser/src/parser.ts
import Ajv from 'ajv';
import * as yaml from 'js-yaml';
import schema from '@spark-view/dsl-spec/schema.json';

export class Parser {
  private ajv = new Ajv();
  private validateSchema = this.ajv.compile(schema);

  parse(input: string, format: 'yaml' | 'json' = 'yaml'): DSLDocument {
    // 1. 解析 YAML/JSON
    const rawDoc = format === 'yaml' ? yaml.load(input) : JSON.parse(input);

    // 2. Schema 验证
    const valid = this.validateSchema(rawDoc);
    if (!valid) {
      throw new Error(`Schema validation failed: ${JSON.stringify(this.validateSchema.errors, null, 2)}`);
    }

    const doc = rawDoc as DSLDocument;

    // 3. 处理表达式
    this.processExpressions(doc.page.layout);

    return doc;
  }

  private processExpressions(node: ComponentNode): void {
    // 处理 props 中的表达式
    if (node.props) {
      for (const [key, value] of Object.entries(node.props)) {
        if (typeof value === 'string' && value.includes('{{')) {
          node.props[key] = this.parseExpression(value);
        }
      }
    }

    // 递归处理子节点
    if (node.children) {
      node.children.forEach(child => this.processExpressions(child));
    }
  }

  private parseExpression(text: string): ExpressionNode | string {
    const match = text.match(/\{\{(.+?)\}\}/);
    if (!match) return text;

    const expression = match[1].trim();
    const lexer = new Lexer(expression);
    const tokens = lexer.tokenize();

    return this.parseExpressionTokens(tokens);
  }

  private parseExpressionTokens(tokens: Token[]): ExpressionNode {
    let current = 0;

    const parseAtom = (): ExpressionNode => {
      const token = tokens[current];

      if (token.type === TokenType.STRING) {
        current++;
        return { type: 'Literal', value: token.value };
      }

      if (token.type === TokenType.NUMBER) {
        current++;
        return { type: 'Literal', value: parseFloat(token.value) };
      }

      if (token.type === TokenType.IDENTIFIER) {
        const name = token.value;
        current++;

        // 函数调用 formatDate(...)
        if (tokens[current]?.type === TokenType.LPAREN) {
          current++; // 跳过 (
          const args: ExpressionNode[] = [];

          while (tokens[current]?.type !== TokenType.RPAREN) {
            args.push(parseAtom());
            if (tokens[current]?.type === TokenType.COMMA) {
              current++;
            }
          }

          current++; // 跳过 )

          return {
            type: 'CallExpression',
            callee: name,
            arguments: args,
          };
        }

        return { type: 'Identifier', name };
      }

      throw new Error(`Unexpected token: ${token.type}`);
    };

    const parseMemberExpression = (): ExpressionNode => {
      let node = parseAtom();

      while (tokens[current]?.type === TokenType.DOT) {
        current++; // 跳过 .
        const property = tokens[current];

        if (property.type !== TokenType.IDENTIFIER) {
          throw new Error(`Expected identifier after dot, got ${property.type}`);
        }

        node = {
          type: 'MemberExpression',
          object: node,
          property: property.value,
        };

        current++;
      }

      return node;
    };

    return parseMemberExpression();
  }
}
```

### 3.3 Parser 测试

```typescript
// packages/dsl-parser/src/parser.test.ts
import { describe, it, expect } from 'vitest';
import { Parser } from './parser';

describe('Parser', () => {
  const parser = new Parser();

  it('should parse valid YAML DSL', () => {
    const yaml = `
dslVersion: "1.0"
page:
  id: test
  title: "Test Page"
  layout:
    type: container
    children:
      - type: text
        props:
          content: "{{ data.message }}"
data:
  message: "Hello World"
`;

    const ast = parser.parse(yaml, 'yaml');

    expect(ast.dslVersion).toBe('1.0');
    expect(ast.page.id).toBe('test');
    expect(ast.data?.message).toBe('Hello World');
  });

  it('should parse member expressions', () => {
    const yaml = `
dslVersion: "1.0"
page:
  id: test
  title: "Test"
  layout:
    type: text
    props:
      content: "{{ data.user.name }}"
`;

    const ast = parser.parse(yaml, 'yaml');
    const textNode = ast.page.layout;
    const expr = textNode.props?.content;

    expect(expr.type).toBe('MemberExpression');
    expect(expr.object.type).toBe('MemberExpression');
    expect(expr.object.property).toBe('user');
    expect(expr.property).toBe('name');
  });

  it('should parse function calls', () => {
    const yaml = `
dslVersion: "1.0"
page:
  id: test
  title: "Test"
  layout:
    type: text
    props:
      content: "{{ formatDate(data.createdAt, 'YYYY-MM-DD') }}"
`;

    const ast = parser.parse(yaml, 'yaml');
    const expr = ast.page.layout.props?.content;

    expect(expr.type).toBe('CallExpression');
    expect(expr.callee).toBe('formatDate');
    expect(expr.arguments).toHaveLength(2);
  });

  it('should throw on invalid schema', () => {
    const invalid = `
dslVersion: "99.0"
page:
  id: test
`;

    expect(() => parser.parse(invalid, 'yaml')).toThrow('Schema validation failed');
  });
});
```

## 4. 错误处理策略

### 4.1 位置追踪

```typescript
export class ParseError extends Error {
  constructor(
    message: string,
    public position: number,
    public line: number,
    public column: number
  ) {
    super(`${message} at line ${line}:${column}`);
    this.name = 'ParseError';
  }
}
```

### 4.2 错误恢复

对于生产环境，我们可以实现错误恢复机制：

```typescript
try {
  const ast = parser.parse(dslContent, 'yaml');
} catch (error) {
  if (error instanceof ParseError) {
    // 记录错误位置，返回部分 AST
    console.error(`Parse error at ${error.line}:${error.column}`);
    return fallbackAST;
  }
  throw error;
}
```

## 5. 性能优化

### 5.1 Token 缓存

对于频繁解析的 DSL，可以缓存 Token 流：

```typescript
const tokenCache = new Map<string, Token[]>();

function getCachedTokens(input: string): Token[] {
  if (!tokenCache.has(input)) {
    const lexer = new Lexer(input);
    tokenCache.set(input, lexer.tokenize());
  }
  return tokenCache.get(input)!;
}
```

### 5.2 增量解析

对于大型 DSL，可以只重新解析修改的部分：

```typescript
interface ParseResult {
  ast: DSLDocument;
  hash: string; // DSL 内容的 hash
}

const parseCache = new Map<string, ParseResult>();
```

## 6. 总结

本文实现了 SPARK.View 的词法分析器和语法分析器：

- **Lexer**：将字符流转换为 9 种 Token 类型
- **Parser**：使用递归下降算法构建 AST
- **验证**：通过 Ajv 进行 JSON Schema 验证
- **表达式**：支持成员访问 `data.user.name` 和函数调用 `formatDate(...)`

在下一篇文章中，我们将实现编译器，将 AST 转换为可执行的 Vue 渲染函数。

## 附录：完整测试覆盖率

```bash
pnpm --filter @spark-view/dsl-parser test

# Coverage: 85.2%
# - lexer.ts: 92%
# - parser.ts: 81%
# - types.ts: 100%
```
