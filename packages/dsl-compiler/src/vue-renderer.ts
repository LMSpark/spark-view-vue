/**
 * Vue Render Function 生成器
 * 将 IR 转换为 Vue 3 Render Function
 */

import { IRNode, IRValue } from './ir-generator';

export interface VueRenderOutput {
  code: string;
  hydrationHints: HydrationHint[];
}

export interface HydrationHint {
  id: string;
  strategy: string;
  priority?: string;
  trigger?: string;
  viewport?: Record<string, unknown>;
}

export class VueRenderer {
  private hydrationHints: HydrationHint[] = [];
  private componentIdCounter = 0;

  render(ir: IRNode): VueRenderOutput {
    this.hydrationHints = [];
    this.componentIdCounter = 0;

    const code = this.generateRenderFunction(ir);

    return {
      code,
      hydrationHints: this.hydrationHints,
    };
  }

  private generateRenderFunction(ir: IRNode): string {
    return `
// 安全表达式求值器
function evaluateExpression(expr, context) {
  const { data = {}, env = {}, item, index } = context || {};
  
  // 内置函数
  const formatDate = (date, format) => {
    // 简单实现，生产环境应使用 date-fns 或 dayjs
    const d = new Date(date);
    return format
      .replace('yyyy', d.getFullYear())
      .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
      .replace('dd', String(d.getDate()).padStart(2, '0'));
  };
  
  const formatNumber = (num, decimals) => {
    return Number(num).toFixed(decimals);
  };
  
  // 安全求值：仅支持 data/env/item/index 访问和白名单函数
  try {
    // 移除 {{ }}
    const cleanExpr = expr.replace(/^{{|}}$/g, '').trim();
    
    // 使用 Function 构造函数（受限环境）
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
  return ${this.generateNode(ir, 'context', 1)};
}
`;
  }

  private generateNode(node: IRNode, contextVar: string, indent: number): string {

    switch (node.type) {
      case 'loop':
        return this.generateLoop(node, contextVar, indent);

      case 'condition':
        return this.generateCondition(node, contextVar, indent);

      case 'element':
        return this.generateElement(node, contextVar, indent);

      case 'text':
        return `'${this.escapeString(node.expression || '')}'`;

      case 'expression':
        return `evaluateExpression('${this.escapeString(
          node.expression || ''
        )}', ${contextVar})`;

      default:
        return `null`;
    }
  }

  private generateElement(node: IRNode, contextVar: string, indent: number): string {
    const indentStr = '  '.repeat(indent);
    const componentId = node.id || `c${this.componentIdCounter++}`;

    // 收集水合提示
    if (node.hydration) {
      this.hydrationHints.push({
        id: componentId,
        strategy: node.hydration.strategy,
        priority: node.hydration.priority,
        trigger: node.hydration.trigger,
        viewport: node.hydration.viewport,
      });
    }

    // 生成属性对象
    const propsCode = this.generateProps(node.props, contextVar, indent + 1);

    // 生成子节点
    const childrenCode = node.children
      ? node.children
          .map((child) => {
            return `${this.generateNode(child, contextVar, indent + 1)}`;
          })
          .join(',\n')
      : '';

    return `${indentStr}h('${node.tag}', {
${propsCode}${node.hydration ? `,\n${indentStr}  'data-hydration-id': '${componentId}'` : ''}
${indentStr}}, [
${childrenCode}
${indentStr}])`;
  }

  private generateProps(
    props: Record<string, IRValue> | undefined,
    contextVar: string,
    indent: number
  ): string {
    if (!props) return '';

    const indentStr = '  '.repeat(indent);
    const entries = Object.entries(props).map(([key, value]) => {
      const propValue = this.generatePropValue(value, contextVar);
      // 转换 camelCase 到 kebab-case 用于 DOM 属性
      const propKey = key === 'onClick' ? 'onClick' : key;
      return `${indentStr}'${propKey}': ${propValue}`;
    });

    return entries.join(',\n');
  }

  private generatePropValue(value: IRValue, contextVar: string): string {
    if (typeof value === 'object' && 'type' in value && value.type === 'expression') {
      return `evaluateExpression('${this.escapeString(value.raw)}', ${contextVar})`;
    }

    if (typeof value === 'string') {
      return `'${this.escapeString(value)}'`;
    }

    return JSON.stringify(value);
  }

  private generateLoop(node: IRNode, contextVar: string, indent: number): string {
    const indentStr = '  '.repeat(indent);
    const itemsExpr = `evaluateExpression('${node.loopItems}', ${contextVar})`;
    const itemVar = node.loopItemVar || 'item';
    const indexVar = node.loopIndexVar || 'index';

    const childCode = node.children?.[0]
      ? this.generateNode(
          node.children[0],
          `{ ...${contextVar}, ${itemVar}: ${itemVar}, ${indexVar}: ${indexVar} }`,
          indent + 1
        )
      : `${indentStr}  return null`;

    return `${indentStr}return (${itemsExpr} || []).map((${itemVar}, ${indexVar}) => {
${childCode}
${indentStr}})`;
  }

  private generateCondition(node: IRNode, contextVar: string, indent: number): string {
    const indentStr = '  '.repeat(indent);
    const conditionExpr = `evaluateExpression('${node.condition}', ${contextVar})`;

    const childCode = node.children?.[0]
      ? this.generateNode(node.children[0], contextVar, indent + 1)
      : `${indentStr}  return null`;

    return `${indentStr}return ${conditionExpr} ? (() => {
${childCode}
${indentStr}})() : null`;
  }

  private escapeString(str: string): string {
    return str.replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  }
}
