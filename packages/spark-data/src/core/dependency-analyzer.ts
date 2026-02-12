/**
 * 依赖分析器（轻量级） - 分析表间依赖关系
 * 
 * 职责：
 * - 📊 构建依赖图（父表、根表、依赖链）
 * - ✅ 检查依赖条件是否满足
 * - 🔍 检测循环依赖（未来扩展）
 * - 📋 优化加载顺序（未来扩展）
 * 
 * 核心原则：
 * - 仅分析元数据（relations配置）
 * - 不执行数据加载（由DataLoader处理）
 * - 不修改数据（只读分析）
 */

import type { DataSet } from '../dataset'
import { Logger } from '@spark-view/spark-utils'

/**
 * 依赖分析器类
 */
export class DependencyAnalyzer {
  private logger = Logger()
  
  constructor(private dataSet: DataSet) {}

  /**
   * 获取表的所有父依赖（递归）
   * @param tableName 表名
   * @returns 父表名称集合（从根到直接父表）
   * 
   * 示例：
   * ```
   * // 依赖链: RootTable -> ParentTable -> ChildTable
   * analyzer.getTableDependencies('ChildTable')
   * // 返回: Set(['RootTable', 'ParentTable'])
   * ```
   */
  getTableDependencies(tableName: string): Set<string> {
    const dependencies = new Set<string>();
    const visited = new Set<string>();
    
    const findParents = (currentTable: string) => {
      if (visited.has(currentTable)) return;
      visited.add(currentTable);
      
      // 找到所有以 currentTable 为子表的关系
      const parentRelations = this.dataSet.relations?.filter(
        rel => rel.childTable === currentTable
      ) ?? [];
      
      parentRelations.forEach(relation => {
        if (!dependencies.has(relation.parentTable)) {
          // 递归查找父表的父表
          findParents(relation.parentTable);
          dependencies.add(relation.parentTable);
        }
      });
    };
    
    findParents(tableName);
    return dependencies;
  }

  /**
   * 获取根依赖表（没有父表的表）
   * @param tableName 表名
   * @returns 根表名称集合
   * 
   * 根表定义：在依赖链中没有父表的表
   * 
   * 示例：
   * ```
   * // 依赖链: Users(root) -> Orders -> OrderItems
   * analyzer.getRootDependencies('OrderItems')
   * // 返回: Set(['Users'])
   * ```
   */
  getRootDependencies(tableName: string): Set<string> {
    const allDependencies = this.getTableDependencies(tableName);
    const rootDeps = new Set<string>();
    
    // 过滤出没有父表的表（根表）
    allDependencies.forEach(depTable => {
      const hasParent = this.dataSet.relations?.some(
        rel => rel.childTable === depTable
      );
      if (!hasParent) {
        rootDeps.add(depTable);
      }
    });
    
    return rootDeps;
  }

  /**
   * 检查表的依赖条件是否满足
   * @param tableName 表名
   * @returns 依赖条件是否满足
   * 
   * 检查项：
   * 1. 父表是否存在
   * 2. 父表是否有数据
   * 3. 根据 dependencyType 检查具体条件：
   *    - currentRow: 父表必须有当前选中行
   *    - selectedRows: 父表必须有选中行
   *    - allRows/pagedRows: 父表有数据即可
   * 
   * 使用场景：
   * - 决定是否加载子表数据
   * - 触发自动加载前的前置检查
   */
  areDependenciesSatisfied(tableName: string): boolean {
    const relations = this.dataSet.relations?.filter(
      rel => rel.childTable === tableName
    ) ?? [];
    
    // 如果没有依赖关系，说明是根表，直接返回 true
    if (relations.length === 0) {
      return true;
    }
    
    // 检查每个依赖关系的条件
    for (const relation of relations) {
      const parentTableObj = this.dataSet.getTable(relation.parentTable);
      if (!parentTableObj) {
        this.logger.info(`❌ [DependencyAnalyzer] 父表 ${relation.parentTable} 不存在`);
        return false;
      }
      
      const parentContext = parentTableObj.getOrCreateContext(
        relation.parentContextId ?? 'default'
      );
      
      // 检查父表是否有数据
      if (!parentTableObj.rows || parentTableObj.rows.length === 0) {
        return false;
      }
      
      // 检查依赖类型的具体条件
      if (relation.dependencyType === 'currentRow') {
        if (!parentContext.currentRow) {
          return false;
        }
      } else if (relation.dependencyType === 'selectedRows') {
        if (!parentContext.selectedRows || parentContext.selectedRows.length === 0) {
          return false;
        }
      }
      // allRows 和 pagedRows 类型只需要父表有数据即可，已在上面检查
    }
    
    return true; // 所有依赖条件都满足
  }

  /**
   * 获取依赖链路（从根到当前表的完整路径）
   * 
   * 示例：
   * ```
   * // 依赖链: Users -> Orders -> OrderItems
   * analyzer.getDependencyChain('OrderItems')
   * // 返回: ['Users', 'Orders', 'OrderItems']
   * ```
   */
  getDependencyChain(tableName: string): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();
    
    const buildChain = (currentTable: string) => {
      if (visited.has(currentTable)) return;
      visited.add(currentTable);
      
      // 找到父表
      const parentRelation = this.dataSet.relations?.find(
        rel => rel.childTable === currentTable
      );
      
      if (parentRelation) {
        // 递归构建父表链
        buildChain(parentRelation.parentTable);
      }
      
      chain.push(currentTable);
    };
    
    buildChain(tableName);
    return chain;
  }

  /**
   * 检测循环依赖
   * 返回所有循环依赖的路径
   * 
   * ⚠️ 未来扩展：
   * - 检测 A -> B -> C -> A 的循环
   * - 返回所有循环路径
   * - 提供修复建议
   */
  detectCircularDependencies(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const detectCycle = (tableName: string, path: string[]) => {
      if (recursionStack.has(tableName)) {
        // 找到循环
        const cycleStart = path.indexOf(tableName);
        cycles.push([...path.slice(cycleStart), tableName]);
        return;
      }
      
      if (visited.has(tableName)) return;
      
      visited.add(tableName);
      recursionStack.add(tableName);
      
      // 找到所有子表
      const childRelations = this.dataSet.relations?.filter(
        rel => rel.parentTable === tableName
      ) ?? [];
      
      childRelations.forEach(relation => {
        detectCycle(relation.childTable, [...path, tableName]);
      });
      
      recursionStack.delete(tableName);
    };
    
    // 遍历所有表
    Object.keys(this.dataSet.tables).forEach(tableName => {
      if (!visited.has(tableName)) {
        detectCycle(tableName, []);
      }
    });
    
    return cycles;
  }

  /**
   * 获取最优加载顺序
   * 根据依赖关系返回表的加载顺序（拓扑排序）
   * 
   * ⚠️ 未来扩展：
   * - 返回最优加载顺序
   * - 支持并行加载独立的表
   * 
   * 示例：
   * ```
   * analyzer.getOptimalLoadOrder()
   * // 返回: ['Users', 'Products', 'Orders', 'OrderItems']
   * ```
   */
  getOptimalLoadOrder(): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    
    const visit = (tableName: string) => {
      if (visited.has(tableName)) return;
      visited.add(tableName);
      
      // 先访问所有父表
      const parentRelations = this.dataSet.relations?.filter(
        rel => rel.childTable === tableName
      ) ?? [];
      
      parentRelations.forEach(relation => {
        visit(relation.parentTable);
      });
      
      order.push(tableName);
    };
    
    // 遍历所有表
    Object.keys(this.dataSet.tables).forEach(tableName => {
      if (!visited.has(tableName)) {
        visit(tableName);
      }
    });
    
    return order;
  }

  /**
   * 获取依赖统计信息
   * 用于调试和性能分析
   */
  getDependencyStats(): {
    totalTables: number;
    totalRelations: number;
    rootTables: string[];
    leafTables: string[];
    maxDependencyDepth: number;
    circularDependencies: string[][];
  } {
    const allTables = Object.keys(this.dataSet.tables);
    const totalRelations = this.dataSet.relations?.length ?? 0;
    
    // 根表：没有父表的表
    const rootTables = allTables.filter(table => {
      return !this.dataSet.relations?.some(rel => rel.childTable === table);
    });
    
    // 叶表：没有子表的表
    const leafTables = allTables.filter(table => {
      return !this.dataSet.relations?.some(rel => rel.parentTable === table);
    });
    
    // 最大依赖深度
    let maxDepth = 0;
    allTables.forEach(table => {
      const chain = this.getDependencyChain(table);
      maxDepth = Math.max(maxDepth, chain.length);
    });
    
    // 循环依赖
    const circularDependencies = this.detectCircularDependencies();
    
    return {
      totalTables: allTables.length,
      totalRelations,
      rootTables,
      leafTables,
      maxDependencyDepth: maxDepth,
      circularDependencies
    };
  }
}
