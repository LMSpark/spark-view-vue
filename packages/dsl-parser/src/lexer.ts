/**
 * 简单词法分析器
 * 用于解析 DSL 表达式（{{ ... }}）
 */

export enum TokenType {
  LBRACE = 'LBRACE',       // {{
  RBRACE = 'RBRACE',       // }}
  DOT = 'DOT',             // .
  LPAREN = 'LPAREN',       // (
  RPAREN = 'RPAREN',       // )
  COMMA = 'COMMA',         // ,
  IDENTIFIER = 'IDENTIFIER',
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export class Lexer {
  private pos = 0;
  private line = 1;
  private column = 1;
  private input: string;

  constructor(input: string) {
    this.input = input;
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.pos < this.input.length) {
      this.skipWhitespace();

      if (this.pos >= this.input.length) break;

      const token = this.nextToken();
      if (token) {
        tokens.push(token);
      }
    }

    tokens.push({
      type: TokenType.EOF,
      value: '',
      line: this.line,
      column: this.column,
    });

    return tokens;
  }

  private nextToken(): Token | null {
    const char = this.input[this.pos];
    const startLine = this.line;
    const startColumn = this.column;

    // 双花括号
    if (char === '{' && this.peek() === '{') {
      this.advance();
      this.advance();
      return { type: TokenType.LBRACE, value: '{{', line: startLine, column: startColumn };
    }

    if (char === '}' && this.peek() === '}') {
      this.advance();
      this.advance();
      return { type: TokenType.RBRACE, value: '}}', line: startLine, column: startColumn };
    }

    // 单字符
    switch (char) {
      case '.':
        this.advance();
        return { type: TokenType.DOT, value: '.', line: startLine, column: startColumn };
      case '(':
        this.advance();
        return { type: TokenType.LPAREN, value: '(', line: startLine, column: startColumn };
      case ')':
        this.advance();
        return { type: TokenType.RPAREN, value: ')', line: startLine, column: startColumn };
      case ',':
        this.advance();
        return { type: TokenType.COMMA, value: ',', line: startLine, column: startColumn };
    }

    // 字符串
    if (char === '"' || char === "'") {
      return this.readString(char);
    }

    // 数字
    if (/\d/.test(char)) {
      return this.readNumber();
    }

    // 标识符
    if (/[a-zA-Z_]/.test(char)) {
      return this.readIdentifier();
    }

    throw new Error(`Unexpected character: ${char} at line ${this.line}, column ${this.column}`);
  }

  private readString(quote: string): Token {
    const startLine = this.line;
    const startColumn = this.column;
    let value = '';

    this.advance(); // skip opening quote

    while (this.pos < this.input.length && this.input[this.pos] !== quote) {
      if (this.input[this.pos] === '\\') {
        this.advance();
        if (this.pos < this.input.length) {
          value += this.input[this.pos];
          this.advance();
        }
      } else {
        value += this.input[this.pos];
        this.advance();
      }
    }

    if (this.pos >= this.input.length) {
      throw new Error(`Unterminated string at line ${startLine}, column ${startColumn}`);
    }

    this.advance(); // skip closing quote

    return { type: TokenType.STRING, value, line: startLine, column: startColumn };
  }

  private readNumber(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    let value = '';

    while (this.pos < this.input.length && /[\d.]/.test(this.input[this.pos])) {
      value += this.input[this.pos];
      this.advance();
    }

    return { type: TokenType.NUMBER, value, line: startLine, column: startColumn };
  }

  private readIdentifier(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    let value = '';

    while (this.pos < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.pos])) {
      value += this.input[this.pos];
      this.advance();
    }

    return { type: TokenType.IDENTIFIER, value, line: startLine, column: startColumn };
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      if (this.input[this.pos] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.pos++;
    }
  }

  private advance(): void {
    this.pos++;
    this.column++;
  }

  private peek(offset = 1): string {
    return this.input[this.pos + offset] || '';
  }
}
