/**
 * DSL 编译器主入口
 */

import { DSLDocument } from '@spark-view/dsl-parser';
import { IRGenerator, IRNode } from './ir-generator';
import { VueRenderer, HydrationHint } from './vue-renderer';
import { RouterGenerator, RouterCodeOutput } from './router-generator';

export interface CompileOutput {
  ssrBundle: string;
  clientChunks: string[];
  criticalCSS?: string;
  hydrationHints: HydrationHint[];
  ir: IRNode;
  routerConfig?: string;
  navigationComponent?: string;
}

export interface CompilerOptions {
  optimize?: boolean;
  minify?: boolean;
  extractCSS?: boolean;
}

export class Compiler {
  private irGenerator: IRGenerator;
  private vueRenderer: VueRenderer;
  private routerGenerator: RouterGenerator;

  constructor(private options: CompilerOptions = {}) {
    this.irGenerator = new IRGenerator();
    this.vueRenderer = new VueRenderer();
    this.routerGenerator = new RouterGenerator();
  }

  /**
   * 编译 DSL 为 Vue SSR Bundle
   */
  compile(dsl: DSLDocument, options: CompilerOptions = {}): CompileOutput {
    // 步骤 1: 生成 IR
    const ir = this.irGenerator.generate(dsl);

    // 步骤 2: 生成 Vue Render Function
    const { code, hydrationHints } = this.vueRenderer.render(ir);

    // 步骤 3: 生成客户端 chunk（简化实现）
    const clientChunks = this.generateClientChunks(hydrationHints);

    // 步骤 4: 提取关键 CSS（可选）
    const criticalCSS = options.extractCSS ? this.extractCriticalCSS(dsl) : undefined;

    // 步骤 5: 生成路由配置代码（如果有路由定义）
    let routerConfig: string | undefined;
    if (dsl.routes && dsl.routes.length > 0) {
      routerConfig = this.routerGenerator.generateRouterConfig(dsl.routes, dsl.router);
    }

    // 步骤 6: 生成导航组件（如果有导航配置）
    let navigationComponent: string | undefined;
    if (dsl.navigation?.header) {
      navigationComponent = this.routerGenerator.generateNavigationComponent(dsl.navigation);
    }

    return {
      ssrBundle: code,
      clientChunks,
      criticalCSS,
      hydrationHints,
      ir,
      routerConfig,
      navigationComponent,
    };
  }

  /**
   * 生成客户端 chunks（按水合策略分组）
   */
  private generateClientChunks(hints: HydrationHint[]): string[] {
    const chunks: string[] = [];

    // 按策略分组
    const strategies = ['immediate', 'idle', 'visible', 'interaction'];

    for (const strategy of strategies) {
      const hintsByStrategy = hints.filter((h) => h.strategy === strategy);

      if (hintsByStrategy.length > 0) {
        chunks.push(
          `chunk-${strategy}.js` // 实际应生成真实代码
        );
      }
    }

    return chunks;
  }

  /**
   * 提取关键 CSS（简化实现）
  /**
   * 提取关键 CSS（Critical CSS）
   */
  private extractCriticalCSS(_dsl: DSLDocument): string {
    // 遍历 DSL，提取内联样式
    // 实际应使用 AST 遍历和 CSS 提取工具
    return `
      /* Critical CSS */
      * { box-sizing: border-box; }
      body { margin: 0; font-family: sans-serif; }
    `;
  }
}

/**
 * 便捷导出
 */
export function compile(dsl: DSLDocument, options?: CompilerOptions): CompileOutput {
  const compiler = new Compiler(options);
  return compiler.compile(dsl, options);
}

export * from './ir-generator';
export * from './vue-renderer';
export * from './router-generator';

