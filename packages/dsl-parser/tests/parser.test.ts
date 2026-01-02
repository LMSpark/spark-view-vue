import { describe, it, expect } from 'vitest';
import { parse, parseExpression } from '../src/parser';
import { DSLDocument, ExpressionNode, ComponentNode } from '../src/types';

describe('DSL Parser', () => {
  describe('parse YAML', () => {
    it('should parse basic YAML DSL', () => {
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
          content: "Hello"
data:
  message: "World"
`;

      const ast = parse(yaml, 'yaml');

      expect(ast.dslVersion).toBe('1.0');
      expect(ast.page.id).toBe('test');
      expect(ast.page.title).toBe('Test Page');
      expect(ast.page.layout.type).toBe('container');
      expect(ast.data).toEqual({ message: 'World' });
    });

    it('should parse component with loop', () => {
      const yaml = `
dslVersion: "1.0"
page:
  id: list
  title: "List Page"
  layout:
    type: container
    children:
      - type: list
        loop:
          items: "data.items"
          itemVar: "item"
          indexVar: "i"
        children:
          - type: text
            props:
              content: "{{ item.name }}"
data:
  items:
    - name: "Item 1"
    - name: "Item 2"
`;

      const ast = parse(yaml, 'yaml');
      const listNode = ast.page.layout.children![0] as ComponentNode;

      expect(listNode.loop).toBeDefined();
      expect(listNode.loop!.items).toBe('data.items');
      expect(listNode.loop!.itemVar).toBe('item');
      expect(listNode.loop!.indexVar).toBe('i');
    });

    it('should parse hydration strategy', () => {
      const yaml = `
dslVersion: "1.0"
page:
  id: hydration-test
  title: "Hydration Test"
  layout:
    type: button
    props:
      text: "Click"
    hydration:
      strategy: idle
      priority: high
`;

      const ast = parse(yaml, 'yaml');
      const button = ast.page.layout;

      expect(button.hydration).toBeDefined();
      expect(button.hydration!.strategy).toBe('idle');
      expect(button.hydration!.priority).toBe('high');
    });
  });

  describe('parse JSON', () => {
    it('should parse basic JSON DSL', () => {
      const json = `
{
  "dslVersion": "1.0",
  "page": {
    "id": "json-test",
    "title": "JSON Test",
    "layout": {
      "type": "container"
    }
  }
}
`;

      const ast = parse(json, 'json');

      expect(ast.dslVersion).toBe('1.0');
      expect(ast.page.id).toBe('json-test');
    });
  });

  describe('parseExpression', () => {
    it('should parse member expression', () => {
      const expr = parseExpression('{{ data.title }}');

      expect(expr).toBeDefined();
      expect(expr!.type).toBe('MemberExpression');
      expect(expr!.object).toEqual({ type: 'Identifier', name: 'data' });
      expect(expr!.property).toEqual({ type: 'Identifier', name: 'title' });
    });

    it('should parse nested member expression', () => {
      const expr = parseExpression('{{ data.user.name }}');

      expect(expr).toBeDefined();
      expect(expr!.type).toBe('MemberExpression');
      expect(expr!.object!.type).toBe('MemberExpression');
    });

    it('should parse function call', () => {
      const expr = parseExpression('{{ formatDate(data.createdAt, "yyyy-MM-dd") }}');

      expect(expr).toBeDefined();
      expect(expr!.type).toBe('CallExpression');
      expect(expr!.callee!.name).toBe('formatDate');
      expect(expr!.arguments).toHaveLength(2);
      expect(expr!.arguments![0].type).toBe('MemberExpression');
      expect(expr!.arguments![1].type).toBe('Literal');
      expect(expr!.arguments![1].value).toBe('yyyy-MM-dd');
    });

    it('should parse formatNumber call', () => {
      const expr = parseExpression('{{ formatNumber(data.price, 2) }}');

      expect(expr).toBeDefined();
      expect(expr!.type).toBe('CallExpression');
      expect(expr!.callee!.name).toBe('formatNumber');
      expect(expr!.arguments).toHaveLength(2);
      expect(expr!.arguments![1].value).toBe(2);
    });

    it('should return null for non-expression', () => {
      const expr = parseExpression('plain text');
      expect(expr).toBeNull();
    });
  });

  describe('schema validation', () => {
    it('should reject invalid dslVersion', () => {
      const yaml = `
dslVersion: "2.0"
page:
  id: test
  title: "Test"
  layout:
    type: container
`;

      expect(() => parse(yaml, 'yaml')).toThrow('Schema validation failed');
    });

    it('should reject missing required fields', () => {
      const yaml = `
dslVersion: "1.0"
page:
  id: test
`;

      expect(() => parse(yaml, 'yaml')).toThrow('Schema validation failed');
    });
  });
});
