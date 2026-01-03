/**
 * DSL 语法解析器
 */

import Ajv from 'ajv';
import { Lexer, Token, TokenType } from './lexer';
import { DSLDocument, ParseError, ExpressionNode, RouteConfig } from './types';
import dslSchema from '@spark-view/dsl-spec/src/schema.json';

const ajv = new Ajv();
const validateSchema = ajv.compile(dslSchema);

export class Parser {
  /**
   * 解析 DSL 内容（JSON 格式）
   */
  public parse(content: string): DSLDocument {
    let dslObject: unknown;

    try {
      dslObject = JSON.parse(content);
    } catch (err: unknown) {
      const error = err as Error;
      throw new ParseError(`Failed to parse JSON: ${error.message}`);
    }

    // JSON Schema 验证
    const isValid = validateSchema(dslObject);
    if (!isValid) {
      const errors = validateSchema.errors?.map((e) => `${e.instancePath} ${e.message}`).join('; ');
      throw new ParseError(`Schema validation failed: ${errors}`);
    }

    const ast = dslObject as DSLDocument;

    // 验证路由配置
    this.validateRoutes(ast);

    return ast;
  }

  /**
   * 验证路由配置
   */
  private validateRoutes(ast: DSLDocument): void {
    if (!ast.routes || ast.routes.length === 0) {
      return;
    }

    // 检查路由路径格式
    for (const route of ast.routes) {
      this.validateRoutePath(route);
    }

    // 检查路由引用的页面是否存在
    const pageIds = new Set<string>();
    if (ast.page) {
      pageIds.add(ast.page.id);
    }
    if (ast.pages) {
      ast.pages.forEach((p) => pageIds.add(p.id));
    }

    for (const route of ast.routes) {
      this.validateRouteReferences(route, pageIds);
    }
  }

  /**
   * 验证路由路径格式
   */
  private validateRoutePath(route: RouteConfig): void {
    if (!route.path.startsWith('/')) {
      throw new ParseError(`Route path must start with '/': ${route.path}`);
    }

    // 递归验证子路由
    if (route.children) {
      route.children.forEach((child) => this.validateRoutePath(child));
    }
  }

  /**
   * 验证路由引用
   */
  private validateRouteReferences(route: RouteConfig, pageIds: Set<string>): void {
    const pageId = route.component || route.pageId;
    if (pageId && !pageIds.has(pageId)) {
      throw new ParseError(`Route '${route.path}' references non-existent page: ${pageId}`);
    }

    if (route.children) {
      route.children.forEach((child) => this.validateRouteReferences(child, pageIds));
    }
  }

  /**
   * 解析表达式（{{ ... }}）
   */
  public parseExpression(expr: string): ExpressionNode | null {
    // 去除 {{ }}
    const trimmed = expr.trim();
    if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
      const innerExpr = trimmed.slice(2, -2).trim();
      return this.parseInnerExpression(innerExpr);
    }

    return null;
  }

  /**
   * 解析内部表达式（不含 {{ }}）
   * 支持：
   * - data.xxx, env.xxx
   * - formatDate(data.time, 'yyyy-MM-dd')
   * - formatNumber(data.price, 2)
   */
  private parseInnerExpression(expr: string): ExpressionNode {
    const lexer = new Lexer(expr);
    const tokens = lexer.tokenize();

    return this.parseExpressionFromTokens(tokens, 0).node;
  }

  private parseExpressionFromTokens(
    tokens: Token[],
    pos: number
  ): { node: ExpressionNode; pos: number } {
    const token = tokens[pos];

    // 标识符（可能是函数调用或成员访问）
    if (token.type === TokenType.IDENTIFIER) {
      const name = token.value;
      pos++;

      // 检查是否是函数调用
      if (tokens[pos]?.type === TokenType.LPAREN) {
        pos++; // skip (
        const args: ExpressionNode[] = [];

        while (tokens[pos]?.type !== TokenType.RPAREN) {
          const arg = this.parseExpressionFromTokens(tokens, pos);
          args.push(arg.node);
          pos = arg.pos;

          if (tokens[pos]?.type === TokenType.COMMA) {
            pos++; // skip ,
          }
        }

        pos++; // skip )

        return {
          node: {
            type: 'CallExpression',
            callee: { type: 'Identifier', name },
            arguments: args,
          },
          pos,
        };
      }

      // 成员访问 (data.xxx, env.xxx)
      let node: ExpressionNode = { type: 'Identifier', name };

      while (tokens[pos]?.type === TokenType.DOT) {
        pos++; // skip .
        const property = tokens[pos];
        if (property.type !== TokenType.IDENTIFIER) {
          throw new ParseError(`Expected identifier after dot, got ${property.type}`);
        }

        node = {
          type: 'MemberExpression',
          object: node,
          property: { type: 'Identifier', name: property.value },
        };

        pos++;
      }

      return { node, pos };
    }

    // 字符串字面量
    if (token.type === TokenType.STRING) {
      return {
        node: { type: 'Literal', value: token.value },
        pos: pos + 1,
      };
    }

    // 数字字面量
    if (token.type === TokenType.NUMBER) {
      return {
        node: { type: 'Literal', value: parseFloat(token.value) },
        pos: pos + 1,
      };
    }

    throw new ParseError(`Unexpected token: ${token.type} at line ${token.line}`);
  }
}

/**
 * 便捷导出
 */
export function parse(content: string): DSLDocument {
  const parser = new Parser();
  return parser.parse(content);
}

export function parseExpression(expr: string): ExpressionNode | null {
  const parser = new Parser();
  return parser.parseExpression(expr);
}
