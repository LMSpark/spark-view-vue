import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler';
import { parse } from '@spark-view/dsl-parser';

describe('DSL Compiler', () => {
  it('should compile basic DSL', () => {
    const yaml = `
dslVersion: "1.0"
page:
  id: test
  title: "Test Page"
  layout:
    type: container
    props:
      class: "container"
    children:
      - type: text
        props:
          content: "{{ data.message }}"
data:
  message: "Hello World"
`;

    const ast = parse(yaml, 'yaml');
    const output = compile(ast);

    expect(output.ssrBundle).toContain('function render');
    expect(output.ssrBundle).toContain('evaluateExpression');
    expect(output.ssrBundle).toContain('createApp');
    expect(output.ir.type).toBe('element');
  });

  it('should generate hydration hints', () => {
    const yaml = `
dslVersion: "1.0"
page:
  id: test
  title: "Test"
  layout:
    type: button
    id: my-button
    props:
      text: "Click"
    hydration:
      strategy: idle
      priority: high
`;

    const ast = parse(yaml, 'yaml');
    const output = compile(ast);

    expect(output.hydrationHints).toHaveLength(1);
    expect(output.hydrationHints[0].id).toBe('my-button');
    expect(output.hydrationHints[0].strategy).toBe('idle');
    expect(output.hydrationHints[0].priority).toBe('high');
  });

  it('should compile loop correctly', () => {
    const yaml = `
dslVersion: "1.0"
page:
  id: list
  title: "List"
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
    const output = compile(ast);

    expect(output.ssrBundle).toContain('.map');
    expect(output.ssrBundle).toContain('item');
    expect(output.ir.children?.[0].type).toBe('loop');
  });

  it('should compile condition correctly', () => {
    const yaml = `
dslVersion: "1.0"
page:
  id: cond
  title: "Conditional"
  layout:
    type: container
    children:
      - type: text
        condition: "data.showMessage"
        props:
          content: "Visible"
data:
  showMessage: true
`;

    const ast = parse(yaml, 'yaml');
    const output = compile(ast);

    expect(output.ssrBundle).toContain('evaluateExpression');
    expect(output.ir.children?.[0].type).toBe('condition');
  });

  it('should generate client chunks', () => {
    const yaml = `
dslVersion: "1.0"
page:
  id: test
  title: "Test"
  layout:
    type: container
    children:
      - type: button
        id: btn1
        hydration:
          strategy: immediate
      - type: button
        id: btn2
        hydration:
          strategy: idle
`;

    const ast = parse(yaml, 'yaml');
    const output = compile(ast);

    expect(output.clientChunks.length).toBeGreaterThan(0);
    expect(output.clientChunks.some((c) => c.includes('immediate'))).toBe(true);
  });

  it('should extract critical CSS when enabled', () => {
    const yaml = `
dslVersion: "1.0"
page:
  id: test
  title: "Test"
  layout:
    type: container
`;

    const ast = parse(yaml, 'yaml');
    const output = compile(ast, { extractCSS: true });

    expect(output.criticalCSS).toBeDefined();
    expect(output.criticalCSS).toContain('Critical CSS');
  });
});
